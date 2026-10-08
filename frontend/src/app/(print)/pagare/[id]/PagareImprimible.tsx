'use client';

import { Printer } from 'lucide-react';
import { construirContenido } from '@/lib/auditoria-legal/pagare-template';
import type { AcreedorConfig } from '@/lib/auditoria-legal/pagare-template';
import type { GarantiaPagareRow } from '@/types/auditoria-legal';

interface Props {
  garantia: GarantiaPagareRow;
  acreedor: AcreedorConfig;
}

export default function PagareImprimible({ garantia, acreedor }: Props) {
  const c = construirContenido(garantia);
  const domicilioNotificaciones = c.esFisica
    ? garantia.deudor_domicilio
    : garantia.representante_domicilio;
  // Mayúsculas sostenidas SÓLO en el texto legal de las cláusulas -- config_sistema
  // guarda la razón social en formato normal (se usa tal cual en otros contextos),
  // así que la transformación es de presentación acá, no un cambio del dato guardado.
  const acreedorUpper = acreedor.razonSocial.toUpperCase();
  // Mayúsculas sostenidas + negrita para el nombre de quien firma en nombre de
  // la persona jurídica (Spec 4, ago 2026) -- se aplica acá en vez de confiar
  // en que el input ya lo guardó en mayúsculas, para que garantías registradas
  // antes de esa máscara también salgan bien en el pagaré impreso.
  const representanteUpper = garantia.representante_legal?.toUpperCase() ?? '';

  return (
    <div>
      <style>{`
        @media print {
          .no-imprimir { display: none !important; }
          /* 8mm/10mm: laterales más angostos para ganar ancho para el header de
             3 columnas (logo + título centrado + consecutivo/monto) sin apretar
             el cuerpo legal. */
          @page { size: letter; margin: 10mm 12mm; }
          /* El fondo de toda la app (--bg-app, gris-azulado) no debe imprimirse
             -- sin esto, print-color-adjust: exact (necesario para que el resto
             de colores salga fiel) también forzaba ese fondo a salir en el PDF. */
          html, body { background: white !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .pagare-bloque-firmas, .pagare-parrafo-fiador, .pagare-clausula { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-imprimir sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <span className="text-sm font-semibold text-gray-700 shrink-0">
          Vista previa — {garantia.consecutivo}
        </span>
        <div className="flex items-center gap-3">
          {/* Esto NO se puede resolver con CSS: la URL/hora/número de página que agrega
              el navegador al imprimir viven fuera del documento (son del diálogo de
              impresión de Chrome/Edge, no de esta página) -- @media print sólo puede
              ocultar elementos DEL documento. Por eso el aviso queda visible siempre
              (antes se ocultaba en mobile) y no sólo como texto secundario. */}
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700">
            ⚠️ Antes de imprimir: desactivá &quot;Encabezados y pies de página&quot; en el diálogo
            de impresión del navegador
          </span>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shrink-0"
            style={{ background: '#009ee3' }}
          >
            <Printer size={15} /> Imprimir
          </button>
        </div>
      </div>

      <div
        className="mx-auto max-w-[21.6cm] bg-white px-9 py-4 text-[12px] leading-normal text-gray-900"
        style={{ fontFamily: 'var(--font-nunito), sans-serif' }}
      >
        {/* Header de 3 columnas (1fr/auto/1fr): logo a la izquierda, título
            REALMENTE centrado en la página (no en el espacio libre entre logo y
            bloque derecho -- las columnas 1 y 3 son 1fr iguales, así que el auto
            del medio queda centrado sin importar cuánto pese cada lado) y
            consecutivo/monto a la derecha. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b pb-2 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- documento de impresión standalone, sin optimización de next/image */}
          <img
            src="/logo-cofersa.png"
            alt="Cofersa"
            className="h-16 max-h-16 w-auto object-contain justify-self-start"
          />
          <h1 className="text-center font-bold text-lg uppercase tracking-wide whitespace-nowrap">
            Pagaré Comercial Sin Protesto
          </h1>
          <div className="text-right justify-self-end">
            <p className="text-xs font-mono text-gray-600">N.° {garantia.consecutivo}</p>
            <p className="font-bold text-sm mt-0.5">Monto: {c.montoTexto}</p>
          </div>
        </div>

        <p className="mb-2">
          <b>Monto:</b> {c.montoTexto} ({c.montoLetras}). <b>Lugar y fecha de emisión:</b>{' '}
          {garantia.lugar_emision}, {c.fechaEmisionTexto}. <b>Fecha de vencimiento:</b>{' '}
          {c.fechaVencimientoTexto}.
        </p>

        <p className="pagare-clausula mb-1 font-bold">PRIMERA: Obligación e Identificación.</p>
        {c.esFisica ? (
          <p className="pagare-clausula mb-2 text-justify">
            Yo, <b>{garantia.cliente_nombre}</b>, mayor de edad,{' '}
            {garantia.deudor_estado_civil?.toLowerCase()}, {garantia.deudor_profesion}, vecino(a) de{' '}
            {garantia.deudor_domicilio}, portador(a) de la cédula de identidad número{' '}
            {garantia.contribuyente}, por este medio y a título personal debo y pagaré
            incondicionalmente a la orden de <b>{acreedorUpper}</b>, cédula jurídica número{' '}
            {acreedor.cedulaJuridica}, o a quien sus derechos represente, la suma de{' '}
            {c.montoLetras.toLowerCase()} ({c.montoTexto}), en el plazo antes indicado.
          </p>
        ) : (
          <p className="pagare-clausula mb-2 text-justify">
            Yo, <b className="uppercase">{representanteUpper}</b>, mayor de edad,{' '}
            {garantia.representante_estado_civil?.toLowerCase()}, {garantia.representante_profesion}
            , vecino(a) de {garantia.representante_domicilio}, portador(a) de la cédula de identidad
            número {garantia.representante_cedula}, en mi condición de Representante Legal de{' '}
            <b>{garantia.cliente_nombre}</b>, cédula jurídica número {garantia.contribuyente}, por
            este medio y en nombre de mi representada debo y pagaré incondicionalmente a la orden de{' '}
            <b>{acreedorUpper}</b>, cédula jurídica número {acreedor.cedulaJuridica}, o a quien sus
            derechos represente, la suma de {c.montoLetras.toLowerCase()} ({c.montoTexto}), en el
            plazo antes indicado, en nombre de mi representada.
          </p>
        )}

        <p className="pagare-clausula mb-1 font-bold">SEGUNDA: Cartera Rotativa.</p>
        <p className="pagare-clausula mb-2 text-justify">
          Este pagaré respalda, hasta por la suma máxima de {c.montoTexto} (
          {c.montoLetras.toLowerCase()}), el saldo de facturas comerciales, compras y demás
          obligaciones de pago presentes y futuras que{' '}
          {c.esFisica ? 'yo mantenga' : 'mi representada mantenga'} con <b>{acreedorUpper}</b>,
          constituyendo una garantía de línea rotativa de crédito y no limitándose a una transacción
          individual, hasta por el monto límite aquí garantizado.
        </p>

        <p className="pagare-clausula mb-1 font-bold">TERCERA: Vencimiento e Intereses.</p>
        <p className="pagare-clausula mb-2 text-justify">
          En caso de mora en el pago, reconoceré un interés moratorio del{' '}
          <b>{garantia.tasa_interes_moratorio}%</b> mensual sobre el saldo adeudado, calculado desde
          la fecha de vencimiento hasta la cancelación efectiva de esta obligación. El
          incumplimiento de pago de cualquier suma adeudada en la fecha convenida facultará a{' '}
          <b>{acreedorUpper}</b> para tener por vencido anticipadamente el plazo de esta obligación
          y exigir de inmediato el pago de la totalidad del saldo pendiente, sin necesidad de
          declaración judicial previa.
        </p>

        <p className="pagare-clausula mb-1 font-bold">CUARTA: Renuncia y Proceso Monitorio.</p>
        <p className="pagare-clausula mb-2 text-justify">
          Renuncio expresamente al trámite de protesto, a requerimientos, avisos y a cualquier otra
          diligencia previa de cobro, SIN NECESIDAD DE PROTESTO, aviso o requerimiento de ninguna
          especie
          {c.esFisica ? '' : ', en nombre de mi representada'}. En caso de incumplimiento,{' '}
          {c.esFisica ? 'me someto' : 'mi representada se somete'} a que este título sea cobrado por
          la vía del proceso monitorio dinerario u otro proceso ejecutivo equivalente ante los
          tribunales de la República de Costa Rica, conforme al Código Procesal Civil vigente
          aplicable a títulos ejecutivos de esta naturaleza.
        </p>

        <p className="pagare-clausula mb-1 font-bold">
          QUINTA: Domicilio y Ley de Notificaciones Judiciales.
        </p>
        <p className="pagare-clausula mb-2 text-justify">
          Para efectos de cualquier notificación judicial o extrajudicial relacionada con esta
          obligación, conforme a la Ley de Notificaciones Judiciales (Ley N.° 8687) y sus reformas,
          señalo como domicilio el indicado en este documento: <b>{domicilioNotificaciones}</b>.
          Cualquier cambio de domicilio deberá comunicarse por escrito a <b>{acreedorUpper}</b>; en
          su defecto, toda notificación practicada en el domicilio aquí señalado se tendrá por
          válidamente realizada.
        </p>

        {garantia.tiene_fiador && (
          <>
            <p className="pagare-clausula mb-1 font-bold">SEXTA: Aval Solidario.</p>
            <p className="pagare-parrafo-fiador mb-2 text-justify">
              Yo, <b>{garantia.fiador_nombre}</b>, mayor de edad,{' '}
              {garantia.fiador_estado_civil?.toLowerCase()}, {garantia.fiador_profesion}, vecino(a)
              de {garantia.fiador_domicilio}, portador(a) de la cédula número{' '}
              {garantia.fiador_cedula}
              {/* fiador_telefono es opcional al registrar la garantía (ver
                  src/app/api/auditoria-legal/garantias/route.ts) -- puede ser null
                  aun con tiene_fiador=true, así que la frase se omite entera en
                  vez de dejar "teléfono ," colgado en el documento firmado. */}
              {garantia.fiador_telefono ? `, teléfono ${garantia.fiador_telefono}` : ''}, por este
              medio me constituyo en FIADOR Y CODEUDOR SOLIDARIO de la obligación anterior, por
              aval, respondiendo solidariamente con el deudor principal, con mis bienes presentes y
              futuros, por el pago total de esta obligación, con renuncia expresa a los beneficios
              de excusión y división.
            </p>
          </>
        )}

        {/* Pie de firmas: línea de firma tradicional (border-top, no caracteres "___"
            literales -- una regla CSS imprime más pareja que repetir el glifo guion bajo)
            + etiqueta explícita + identidad (Cédula/Razón Social o Cédula/Domicilio).
            Rediseño ago 2026: el sello de empresa ya NO va en un recuadro grande
            apilado debajo (desperdiciaba espacio vertical) -- ahora vive al lado
            de la línea de firma, en la misma fila (sólo si el deudor es persona
            jurídica; una física no tiene sello propio que estampar). */}
        <div className="pagare-bloque-firmas grid grid-cols-2 gap-4 mt-2 pt-1.5 border-t text-[11px]">
          <div className="px-2">
            <div className={c.esFisica ? '' : 'grid grid-cols-[1fr_auto] gap-2 items-end'}>
              <div>
                <div className="h-7" />
                <div className="border-t-2 border-gray-800" />
              </div>
              {!c.esFisica && (
                <div className="mb-px rounded border border-dashed border-gray-400 px-2.5 py-1.5 text-center text-[8px] leading-tight text-gray-400 whitespace-nowrap">
                  (Estampa de
                  <br />
                  Sello de Empresa)
                </div>
              )}
            </div>
            {/* Etiqueta y campo de identidad cambian según física/jurídica -- una
                persona física no tiene "Razón Social", tiene Nombre. */}
            <p className="mt-1.5 text-center font-bold uppercase tracking-wide">
              {c.esFisica
                ? 'Firma de Conformidad — Deudor Principal'
                : 'Firma de Conformidad y Sello — Deudor (Repr. Legal)'}
            </p>
            <p className="mt-1 text-center text-gray-600">
              Cédula: {c.esFisica ? garantia.contribuyente : garantia.representante_cedula}
            </p>
            {/* Nombre de quien firma en negrita+mayúsculas (Spec 4, ago 2026) --
                antes la línea de firma sólo mostraba Cédula + Razón Social de la
                empresa, sin el nombre de la persona física que realmente firma. */}
            {!c.esFisica && (
              <p className="text-center text-gray-600">
                Representante Legal: <b className="uppercase">{representanteUpper}</b>
              </p>
            )}
            <p className="text-center text-gray-600">
              {c.esFisica ? 'Nombre' : 'Razón Social'}: {garantia.cliente_nombre}
            </p>
          </div>
          {garantia.tiene_fiador && (
            <div className="px-2">
              <div className="h-7" />
              <div className="border-t-2 border-gray-800" />
              <p className="mt-1.5 text-center font-bold uppercase tracking-wide">
                Firma Fiador Solidario (Aval Personal)
              </p>
              <p className="mt-1 text-center text-gray-600">Cédula: {garantia.fiador_cedula}</p>
              <p className="text-center text-gray-600">Domicilio: {garantia.fiador_domicilio}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
