from uuid import uuid4

import pytest

from application.use_cases.centro_recursos import (
    ActualizarAplicacionUseCase,
    ActualizarMarcaUseCase,
    CrearAplicacionUseCase,
    CrearDocumentoUseCase,
    CrearMarcaUseCase,
    CrearUrlCargaDocumentoUseCase,
    GetCentroRecursosUseCase,
    ListAplicacionesUseCase,
    ListDocumentosUseCase,
)
from domain.exceptions import ForbiddenError, NotFoundError, ValidationError
from entrypoints.lambda_handlers import centro_recursos as handlers
from fakes.fake_app_unit_of_work import FakeAppUnitOfWork, FakeStorage, principal_for
from fakes.fake_centro_recursos import FakeCentroRecursosRepository


@pytest.fixture
def world():
    repo = FakeCentroRecursosRepository()
    uow = FakeAppUnitOfWork(centro_recursos=repo)
    coord = uow.usuarios.add("jdiaz@cofersa.cr", "COORDINADOR")
    analista = uow.usuarios.add("agomez@cofersa.cr", "ANALISTA")
    gerencia = uow.usuarios.add("jgarcia@cofersa.cr", "GERENCIA")
    return uow, repo, FakeStorage(), coord, analista, gerencia


def test_routes_cover_original_api(world):
    assert ("PUT", "/centro-recursos/aplicaciones/{id}") in handlers.ROUTES
    assert ("PUT", "/centro-recursos/marcas/{id}") in handlers.ROUTES
    assert ("POST", "/centro-recursos/documentos/upload-url") in handlers.ROUTES


def test_lectura_para_cualquier_usuario_activo(world):
    uow, repo, storage, coord, analista, _ = world
    CrearAplicacionUseCase(uow.factory).execute(principal_for(coord), {"nombre": " CRM ", "url": "https://x"})
    data = ListAplicacionesUseCase(uow.factory).execute(principal_for(analista))["data"]
    assert data[0]["nombre"] == "CRM" and data[0]["icono"] == "Layers" and data[0]["estado"] == "Operativa"
    pagina = GetCentroRecursosUseCase(uow.factory, storage).execute(principal_for(analista))
    assert set(pagina) >= {"vendedores", "supervisores", "documentos", "aplicaciones", "marcas", "directorio"}
    baja = uow.usuarios.add("baja@cofersa.cr", "ANALISTA", activo=False)
    with pytest.raises(ForbiddenError):
        ListAplicacionesUseCase(uow.factory).execute(principal_for(baja))


def test_escritura_solo_coordinador(world):
    uow, _, storage, _, analista, gerencia = world
    for usuario in (analista, gerencia):
        with pytest.raises(ForbiddenError) as error:
            CrearAplicacionUseCase(uow.factory).execute(principal_for(usuario), {"nombre": "a", "url": "b"})
        assert error.value.message == "Acceso restringido al coordinador"
        with pytest.raises(ForbiddenError):
            CrearMarcaUseCase(uow.factory).execute(principal_for(usuario), {"nombre": "m"})
        with pytest.raises(ForbiddenError):
            CrearUrlCargaDocumentoUseCase(uow.factory, storage).execute(principal_for(usuario), {})


def test_aplicacion_validaciones_y_auditoria(world):
    uow, repo, _, coord, _, _ = world
    with pytest.raises(ValidationError) as error:
        CrearAplicacionUseCase(uow.factory).execute(principal_for(coord), {"nombre": "x", "url": " "})
    assert error.value.message == "Nombre y URL son requeridos"
    app = CrearAplicacionUseCase(uow.factory).execute(principal_for(coord), {"nombre": "A", "url": "u"})[
        "data"
    ]
    use_case = ActualizarAplicacionUseCase(uow.factory)
    with pytest.raises(ValidationError) as error:
        use_case.execute(principal_for(coord), str(app["id"]), {"nombre": "  "})
    assert error.value.message == "El nombre no puede quedar vacío"
    with pytest.raises(NotFoundError):
        use_case.execute(principal_for(coord), "no-uuid", {"orden": 1})
    updated = use_case.execute(principal_for(coord), str(app["id"]), {"orden": 3, "descripcion": " "})["data"]
    assert updated["orden"] == 3 and updated["descripcion"] is None
    assert [a["accion"] for a in repo.auditoria] == ["INSERT", "UPDATE"]
    assert repo.auditoria[0]["realizado_por"] == "jdiaz@cofersa.cr"


def test_documento_upload_y_registro_con_url_firmada(world):
    uow, repo, storage, coord, analista, _ = world
    upload = CrearUrlCargaDocumentoUseCase(uow.factory, storage).execute(
        principal_for(coord), {"filename": "Política crédito.pdf", "content_type": "application/pdf"}
    )
    assert upload["key"].endswith("_Pol_tica_cr_dito.pdf") and upload["headers"]["Content-Type"]
    crear = CrearDocumentoUseCase(uow.factory, storage)
    body = {"key": upload["key"], "titulo": "Política", "categoria": "Políticas de Crédito"}
    with pytest.raises(ValidationError) as error:
        crear.execute(principal_for(coord), body)  # todavía no se subió el archivo
    assert error.value.message == "Archivo requerido"
    storage.put_bytes(upload["key"], b"%PDF", "application/pdf")
    with pytest.raises(ValidationError) as error:
        crear.execute(principal_for(coord), {**body, "categoria": "Otra"})
    assert error.value.message == "Categoría inválida"
    with pytest.raises(ValidationError) as error:
        crear.execute(principal_for(coord), {**body, "titulo": ""})
    assert error.value.message == "Título requerido"
    doc = crear.execute(principal_for(coord), body)["data"]
    assert doc["tipo_archivo"] == "pdf" and doc["url"].startswith("https://storage.test/")
    assert next(iter(repo.documentos.values()))["url"] == upload["key"]  # en BD queda la key


def test_documentos_migrados_con_url_publica(world):
    uow, repo, storage, _, analista, _ = world
    repo.crear_documento(
        {
            "titulo": "Viejo",
            "url": "https://abc.storage-legado.test/storage/v1/object/public/documentos-recursos/1700_a%20b.pdf",
        }
    )
    repo.crear_documento({"titulo": "Externo", "url": "https://drive.google.com/x"})
    data = ListDocumentosUseCase(uow.factory, storage).execute(principal_for(analista))["data"]
    urls = {d["titulo"]: d["url"] for d in data}
    assert urls["Viejo"].startswith("https://storage.test/1700_a b.pdf")
    assert urls["Externo"] == "https://drive.google.com/x"


def test_marcas_crear_y_actualizar(world):
    uow, repo, _, coord, _, _ = world
    comprador = str(uuid4())
    with pytest.raises(ValidationError) as error:
        CrearMarcaUseCase(uow.factory).execute(principal_for(coord), {"nombre": "Stanley"})
    assert error.value.message == "Nombre y comprador son requeridos"
    marca = CrearMarcaUseCase(uow.factory).execute(
        principal_for(coord), {"nombre": "Stanley", "comprador_id": comprador, "proveedor": " "}
    )["data"]
    assert marca["proveedor"] is None
    update = ActualizarMarcaUseCase(uow.factory)
    with pytest.raises(ValidationError) as error:
        update.execute(principal_for(coord), str(marca["id"]), {})
    assert error.value.message == "Nada para actualizar"
    with pytest.raises(ValidationError) as error:
        update.execute(principal_for(coord), str(marca["id"]), {"comprador_id": ""})
    assert error.value.message == "El comprador es requerido"
    with pytest.raises(NotFoundError) as error:
        update.execute(principal_for(coord), str(uuid4()), {"nombre": "x"})
    assert error.value.message == "Marca no encontrada"
    otro = uuid4()
    data = update.execute(principal_for(coord), str(marca["id"]), {"comprador_id": str(otro)})["data"]
    assert data["comprador_id"] == otro
    assert repo.auditoria[-1]["descripcion"] == 'Marca "Stanley" actualizada'
