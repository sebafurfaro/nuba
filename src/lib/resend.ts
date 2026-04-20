import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM ?? "noreply@nuba.nodoapp.com.ar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year!, month! - 1, day!);
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// sendReservationConfirmationEmail
// ---------------------------------------------------------------------------

export async function sendReservationConfirmationEmail(data: {
  to: string;
  customerName: string;
  tenantName: string;
  date: string;
  time: string;
  partySize: number;
  tableName?: string;
  notes?: string;
}): Promise<void> {
  const dateLabel = formatDate(data.date);
  const tableInfo = data.tableName ? `<p><strong>Mesa:</strong> ${data.tableName}</p>` : "";
  const notesInfo = data.notes ? `<p><strong>Notas:</strong> ${data.notes}</p>` : "";

  await resend.emails.send({
    from: FROM,
    to: data.to,
    subject: `Reserva confirmada en ${data.tenantName}`,
    html: `
      <p>Hola ${data.customerName},</p>
      <p>Tu reserva en <strong>${data.tenantName}</strong> está confirmada.</p>
      <p><strong>Fecha:</strong> ${dateLabel}</p>
      <p><strong>Hora:</strong> ${data.time}</p>
      <p><strong>Personas:</strong> ${data.partySize}</p>
      ${tableInfo}
      ${notesInfo}
      <p>¡Te esperamos!</p>
    `,
  });
}

// ---------------------------------------------------------------------------
// sendReservationCancellationEmail
// ---------------------------------------------------------------------------

export async function sendReservationCancellationEmail(data: {
  to: string;
  customerName: string;
  tenantName: string;
  date: string;
  time: string;
}): Promise<void> {
  const dateLabel = formatDate(data.date);

  await resend.emails.send({
    from: FROM,
    to: data.to,
    subject: `Reserva cancelada en ${data.tenantName}`,
    html: `
      <p>Hola ${data.customerName},</p>
      <p>Te informamos que tu reserva en <strong>${data.tenantName}</strong> 
      del ${dateLabel} a las ${data.time} ha sido cancelada.</p>
      <p>Si tenés dudas, contactanos directamente.</p>
    `,
  });
}
