import { redirect } from 'next/navigation';

// El reporte vive en el Hub de Reportes: /reportes/pagos-aplicados
export default function PagosAplicadosRedirect() {
  redirect('/reportes/pagos-aplicados');
}
