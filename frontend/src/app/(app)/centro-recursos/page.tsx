import { redirect } from 'next/navigation';
import CentroRecursosTabs from '@/components/centro-recursos/CentroRecursosTabs';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import type {
  AgenteDirectorio,
  DocumentoRecurso,
  AplicacionRecurso,
  JefeRegionalNodo,
  Comprador,
  MiembroAcotado,
} from '@/types/centro-recursos';
import { getServerHttp } from '@/shared/api/server-http';
import type { ApiError } from '@/shared/api/api-error';
import { createCentroRecursosApi } from '@/views/centro-recursos/api/centro-recursos-api';
import type { CentroRecursosPaginaResponse } from '@/views/centro-recursos/types';

// ══════════════════════════════════════════════════════════════════════
export default async function CentroRecursosPage() {
  // ── 1. Verificar sesión (los tres roles tienen acceso a este módulo) ──
  const { user, rolEfectivo } = await getUsuarioActual();
  if (!user?.email) redirect('/login');

  const soyCoordinador = rolEfectivo === 'COORDINADOR';

  // ── 2-3. Datos de la pantalla en una sola llamada (GET /centro-recursos) ──
  // Antes: 9 consultas en paralelo con service_role; ahora el backend las resuelve juntas.
  let datos: CentroRecursosPaginaResponse;
  try {
    datos = await createCentroRecursosApi(await getServerHttp()).pagina();
  } catch (e) {
    return (
      <div className="p-5">
        <div className="bg-white rounded-2xl border border-red-200 p-5 text-sm text-red-700">
          No se pudo cargar el Centro de Recursos: {(e as ApiError).message ?? 'error desconocido'}.
          Intente recargar la página.
        </div>
      </div>
    );
  }
  const vendedoresRes = { data: datos.vendedores };
  const supervisoresRes = { data: datos.supervisores };
  const usuariosRes = { data: datos.usuarios };
  const documentosRes = { data: datos.documentos };
  const aplicacionesRes = { data: datos.aplicaciones };
  const gruposRes = { data: datos.grupos };
  const miembrosRes = { data: datos.miembros };
  const directorioRes = { data: datos.directorio };
  const marcasRes = { data: datos.marcas };

  // ── 4. Mapas de apoyo (supervisor, jefe regional, analista, portafolio) ──
  type SupervisorFila = {
    cod: string;
    nombre: string;
    es_jefe_regional: boolean;
    jefe_regional_cod: string | null;
  };
  const supervisores = (supervisoresRes.data ?? []) as SupervisorFila[];

  const supMap: Record<string, SupervisorFila> = {};
  supervisores.forEach((s) => {
    supMap[s.cod] = s;
  });

  const analistaMap: Record<string, string> = {};
  ((usuariosRes.data ?? []) as Array<{ email: string; nombre: string }>).forEach((u) => {
    analistaMap[u.email] = u.nombre;
  });

  // Info completa de cada vendedor (para resolver columnas de los miembros de portafolio acotado)
  const vendedorInfoMap: Record<string, MiembroAcotado> = {};
  ((vendedoresRes.data ?? []) as Array<Record<string, unknown>>).forEach((v) => {
    const cod = v.cod as string;
    vendedorInfoMap[cod] = {
      cod,
      nombre: v.nombre as string,
      zona: v.zona as string | null,
      telefono: v.telefono as string | null,
      analista_nombre: v.analista_email ? (analistaMap[v.analista_email as string] ?? null) : null,
    };
  });

  // Rutas activas de portafolio acotado → miembros secundarios por vendedor principal
  const principalesActivos = new Set(
    ((gruposRes.data ?? []) as Array<{ principal_cod: string; activo: boolean }>)
      .filter((g) => g.activo)
      .map((g) => g.principal_cod),
  );
  const miembrosPorPrincipal: Record<string, MiembroAcotado[]> = {};
  (
    (miembrosRes.data ?? []) as Array<{
      principal_cod: string;
      vendedor_cod: string;
      activo: boolean;
    }>
  ).forEach((m) => {
    if (m.activo && principalesActivos.has(m.principal_cod)) {
      if (!miembrosPorPrincipal[m.principal_cod]) miembrosPorPrincipal[m.principal_cod] = [];
      miembrosPorPrincipal[m.principal_cod].push(
        vendedorInfoMap[m.vendedor_cod] ?? {
          cod: m.vendedor_cod,
          nombre: m.vendedor_cod,
          zona: null,
          telefono: null,
          analista_nombre: null,
        },
      );
    }
  });

  // ── 5. Armar el directorio consolidado (vendedores + supervisor + jefe regional + analista) ──
  const directorio: AgenteDirectorio[] = (
    (vendedoresRes.data ?? []) as Array<Record<string, unknown>>
  ).map((v) => {
    const supCod = v.supervisor_cod as string | null;
    const sup = supCod ? supMap[supCod] : undefined;
    // Un vendedor puede reportar directo a un Jefe Regional (su supervisor_cod
    // apunta a esa fila de `supervisores`) -- en ese caso el jefe es el propio
    // "supervisor", no hay que buscar un jefe_regional_cod que no existe en su fila.
    const jefe = sup?.es_jefe_regional
      ? sup
      : sup?.jefe_regional_cod
        ? supMap[sup.jefe_regional_cod]
        : undefined;
    const miembros = miembrosPorPrincipal[v.cod as string];
    return {
      cod: v.cod as string,
      nombre: v.nombre as string,
      supervisor_cod: supCod,
      supervisor_nombre: sup?.nombre ?? null,
      jefe_regional_cod: jefe?.cod ?? null,
      jefe_regional_nombre: jefe?.nombre ?? null,
      zona: v.zona as string | null,
      telefono: v.telefono as string | null,
      analista_nombre: v.analista_email ? (analistaMap[v.analista_email as string] ?? null) : null,
      tipo_canal: (v.tipo_canal as string) ?? 'Venta Regular',
      es_principal_acotado: !!miembros && miembros.length > 0,
      miembros_acotado: miembros ?? [],
    };
  });

  // ── 5b. Compradores (Gerentes de Marca) con sus marcas a cargo ────
  type MarcaFila = {
    id: string;
    nombre: string;
    proveedor: string | null;
    comprador_id: string;
    notas: string | null;
  };
  const marcas = (marcasRes.data ?? []) as MarcaFila[];
  const compradores: Comprador[] = (
    (directorioRes.data ?? []) as Array<{
      id: string;
      nombre: string;
      email: string;
      telefono: string | null;
      es_comprador: boolean;
    }>
  )
    .filter((c) => c.es_comprador)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      email: c.email,
      telefono: c.telefono,
      marcas: marcas
        .filter((m) => m.comprador_id === c.id)
        .map((m) => ({ id: m.id, nombre: m.nombre, proveedor: m.proveedor, notas: m.notas })),
    }));

  // ── 6. Árbol relacional: Jefe Regional → Supervisores / Canales Especiales / Rutas de Control ──
  const jefes = supervisores.filter((s) => s.es_jefe_regional);
  const arbol: JefeRegionalNodo[] = jefes.map((j) => ({
    cod: j.cod,
    nombre: j.nombre,
    supervisores: supervisores
      .filter((s) => !s.es_jefe_regional && s.jefe_regional_cod === j.cod)
      .map((s) => ({ cod: s.cod, nombre: s.nombre })),
    // Televenta / Cuenta Clave que reportan DIRECTO al jefe (se saltan el nivel de supervisor)
    canalesEspeciales: directorio
      .filter((a) => a.supervisor_cod === j.cod && a.tipo_canal !== 'Ruta Administrativa')
      .map((a) => ({ cod: a.cod, nombre: a.nombre, tipo_canal: a.tipo_canal })),
    // Rutas administrativas (0 clientes) que resuelven a este jefe, vía supervisor o directo
    rutasControl: directorio
      .filter((a) => a.tipo_canal === 'Ruta Administrativa' && a.jefe_regional_cod === j.cod)
      .map((a) => ({ cod: a.cod, nombre: a.nombre })),
  }));
  const sinAsignar = supervisores.filter((s) => !s.es_jefe_regional && !s.jefe_regional_cod);
  if (sinAsignar.length > 0) {
    arbol.push({
      cod: '__sin_asignar__',
      nombre: 'Sin Jefe Regional asignado',
      supervisores: sinAsignar.map((s) => ({ cod: s.cod, nombre: s.nombre })),
      canalesEspeciales: [],
      rutasControl: [],
    });
  }

  // ── 7. Render ────────────────────────────────────────────────────
  return (
    <div className="p-5">
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <CentroRecursosTabs
          directorio={directorio}
          arbol={arbol}
          compradores={compradores}
          documentos={(documentosRes.data ?? []) as DocumentoRecurso[]}
          aplicaciones={(aplicacionesRes.data ?? []) as AplicacionRecurso[]}
          soyCoordinador={soyCoordinador}
        />
      </div>
    </div>
  );
}
