export function formatCurrency(value: number | string | null | undefined, showCurrency = false): string {
  const num = Number(value || 0);
  const formatted = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(num));
  return showCurrency ? `$${formatted} COP` : `$${formatted}`;
}

export function formatDateTime(dateStr: string | Date): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(dateStr: string | Date): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function fullClientName(nombres?: string, apellidos?: string): string {
  return `${nombres || ''} ${apellidos || ''}`.trim() || 'Cliente';
}

export function getEstadoPagoStyle(estado: string): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  if (estado === 'Pagada') {
    return {
      bg: 'bg-[#16A36A]/12',
      text: 'text-[#34D399]',
      border: 'border-[#16A36A]/30',
      dot: 'bg-[#16A36A]',
    };
  }
  if (estado === 'Parcialmente pagada') {
    return {
      bg: 'bg-[#2563EB]/12',
      text: 'text-[#60A5FA]',
      border: 'border-[#2563EB]/30',
      dot: 'bg-[#2563EB]',
    };
  }
  return {
    bg: 'bg-[#F59E0B]/12',
    text: 'text-[#FBBF24]',
    border: 'border-[#F59E0B]/30',
    dot: 'bg-[#F59E0B]',
  };
}
