import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { FlashMessage } from '../types';

interface Props {
  messages: FlashMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ messages, onDismiss }: Props) {
  if (messages.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
    >
      {messages.map((msg) => {
        const styles =
          msg.type === 'success'
            ? {
                bg: 'bg-[#0F241D] border-[#16A36A]/40 text-[#ECFDF5]',
                icon: <CheckCircle2 className="w-5 h-5 text-[#16A36A] shrink-0" />,
                label: msg.title || 'Operación exitosa',
              }
            : msg.type === 'error'
              ? {
                  bg: 'bg-[#261116] border-[#DC2626]/45 text-[#FEF2F2]',
                  icon: <XCircle className="w-5 h-5 text-[#EF4444] shrink-0" />,
                  label: msg.title || 'Error de validación',
                }
              : msg.type === 'warning'
                ? {
                    bg: 'bg-[#271C0B] border-[#F59E0B]/45 text-[#FFFBEB]',
                    icon: <AlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0" />,
                    label: msg.title || 'Advertencia',
                  }
                : {
                    bg: 'bg-[#111C33] border-[#2563EB]/40 text-[#EFF6FF]',
                    icon: <Info className="w-5 h-5 text-[#60A5FA] shrink-0" />,
                    label: msg.title || 'Información',
                  };

        return (
          <div
            key={msg.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-200 ${styles.bg}`}
          >
            <div className="mt-0.5">{styles.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold tracking-tight opacity-90">{styles.label}</p>
              <p className="text-sm font-medium mt-0.5 leading-snug">{msg.message}</p>
            </div>
            <button
              onClick={() => onDismiss(msg.id)}
              className="p-1 rounded-md opacity-70 hover:opacity-100 hover:bg-white/10 transition-colors"
              aria-label="Cerrar notificación"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
