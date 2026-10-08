import TablaClientes from '@/components/clientes/tabla-clientes';
import { getUsuarioActual } from '@/lib/utils/usuario-actual';
import { getServerHttp } from '@/shared/api/server-http';
import type { ApiError } from '@/shared/api/api-error';
import { createClientesApi } from '@/views/clientes/api/clientes-api';
import type {
  ClienteRow,
  KPIsClientes,
  AnalistaOpt,
  VendedorOpt,
  FiltrosClientes,
  ClientesListaResult,
} from '@/views/clientes/types';

// ── Interfaces exportadas (ahora viven en views/clientes/types.ts) ─────
export type {
  ClienteRow,
  KPIsClientes,
  AnalistaOpt,
  VendedorOpt,
  FiltrosClientes,
} from '@/views/clientes/types';

const PAGE_SIZE = 25;

// ── Forma del JSON que devuelve GET /clientes (fn_clientes_lista) ─────
type RpcClientesResult = ClientesListaResult;

const RPC_VACIO: RpcClientesResult = {
  rows: [],
  total_rows: 0,
  kpi_cartera: 0,
  kpi_mora: 0,
  vendedores: [],
  analistas: [],
  plazos: [],
  niveles_precio: [],
  dimensiones: [],
};

function errorLista(e: unknown) {
  return (
    <div className="p-5">
      <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700 font-semibold">
        No se pudo cargar la lista de clientes: {(e as ApiError).message ?? 'error desconocido'}
      </div>
    </div>
  );
}

// ── Página (Server Component) ─────────────────────────────────────────
interface PageProps {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}

export default async function ClientesPage({ searchParams }: PageProps) {
  const api = createClientesApi(await getServerHttp());
  const sp = await searchParams;

  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

  // ── Parsear filtros desde URL ─────────────────────────────────────
  const filtros: FiltrosClientes = {
    q: str(sp.q),
    analista: str(sp.analista),
    vendedor: str(sp.vendedor),
    plazo: str(sp.plazo),
    nivelPrecio: str(sp.nivelPrecio),
    dimension: str(sp.dimension),
    sort: str(sp.sort) || 'mora_total',
    dir: str(sp.dir) === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, parseInt(str(sp.page) || '1', 10)),
  };

  // ── Lista paginada — filtra, ordena y pagina en la base de datos ──
  // (GET /clientes → fn_clientes_lista reemplaza las ~7 queries anteriores que
  // traían toda la cartera + gestiones + maestro_clientes en cada carga)
  const callLista = (page: number) => api.lista(filtros, page, PAGE_SIZE);

  // Perf: la resolución de usuario/rol (para decidir si exponer `analistas`)
  // no depende de la lista ni viceversa -- van juntas y reusan el resultado
  // cacheado por request (usuario-actual.ts).
  let pagina = filtros.page;
  let usuarioActual: Awaited<ReturnType<typeof getUsuarioActual>>;
  let result: RpcClientesResult;
  try {
    [usuarioActual, result] = await Promise.all([getUsuarioActual(), callLista(pagina)]);
  } catch (e) {
    return errorLista(e);
  }
  const userEmail = usuarioActual.userEmail;
  const esCoordinador = usuarioActual.rolEfectivo === 'COORDINADOR';

  result = result ?? RPC_VACIO;
  let totalPages = Math.max(1, Math.ceil(result.total_rows / PAGE_SIZE));

  // Si la página pedida en la URL quedó fuera de rango (ej. tras cambiar
  // un filtro), reintentar con la última página válida.
  if (pagina > totalPages) {
    pagina = totalPages;
    try {
      result = (await callLista(pagina)) ?? RPC_VACIO;
    } catch (e) {
      return errorLista(e);
    }
    totalPages = Math.max(1, Math.ceil(result.total_rows / PAGE_SIZE));
  }

  const rows: ClienteRow[] = result.rows.map((r) => ({ ...r, dias_mora: 0 }));

  const kpis: KPIsClientes = {
    carteraFiltrada: result.kpi_cartera,
    moraFiltrada: result.kpi_mora,
    pctMorosidad: result.kpi_cartera > 0 ? (result.kpi_mora / result.kpi_cartera) * 100 : null,
    totalClientes: result.total_rows,
  };

  const vendedores: VendedorOpt[] = result.vendedores.map((nombre) => ({ nombre }));
  const analistas: AnalistaOpt[] = esCoordinador ? result.analistas : [];

  return (
    <TablaClientes
      rows={rows}
      kpis={kpis}
      totalRows={result.total_rows}
      page={pagina}
      totalPages={totalPages}
      filtros={filtros}
      esCoordinador={esCoordinador}
      analistas={analistas}
      vendedores={vendedores}
      plazos={result.plazos}
      nivelesPrecio={result.niveles_precio}
      dimensiones={result.dimensiones}
      userEmail={userEmail}
    />
  );
}
