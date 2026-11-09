import React from 'react';
import { Printer, X } from 'lucide-react';

export interface PrintableDocument {
  title: string;
  subtitle: string;
  type: 'TABLE_CREDENTIALS' | 'KITCHEN_TICKET' | 'ACCOUNT_SUMMARY' | 'MANAGEMENT_REPORT';
  tableCode?: string;
  qrDataUrl?: string;
  accessCode?: string;
  accessPassword?: string;
  expiresAt?: string;
  lines: Array<{ label: string; value: string; mono?: boolean }>;
  footerNote: string;
}

interface PrintModalProps {
  doc: PrintableDocument | null;
  onClose: () => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({ doc, onClose }) => {
  if (!doc) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 no-print">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Impressão Térmica / Padrão</h3>
            <p className="text-xs text-slate-500">Formato otimizado 80mm e A4</p>
          </div>
          <button
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-lg transition-colors"
            aria-label="Fechar janela de impressão"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 font-mono text-xs text-slate-900 space-y-4 bg-slate-50/60">
          <div className="text-center border-b border-dashed border-slate-300 pb-3 space-y-1">
            <div className="text-sm font-bold">{doc.title}</div>
            <div className="text-slate-600">{doc.subtitle}</div>
            {doc.tableCode && (
              <div className="text-base font-bold pt-1">MESA: {doc.tableCode}</div>
            )}
          </div>

          {doc.qrDataUrl && (
            <div className="flex flex-col items-center justify-center py-2 space-y-2 border-b border-dashed border-slate-300 pb-4">
              <img
                src={doc.qrDataUrl}
                alt={`QR Code de acesso à ${doc.tableCode || 'Mesa'}`}
                referrerPolicy="no-referrer"
                className="w-44 h-44 border border-slate-200 p-2 bg-white rounded-lg"
              />
              <div className="text-center space-y-1">
                <div className="text-slate-500">Código da Sessão Temporária:</div>
                <div className="text-base font-bold tracking-wider">{doc.accessCode}</div>
                <div className="text-slate-500 pt-1">Senha / PIN da Mesa:</div>
                <div className="text-lg font-bold tracking-widest text-amber-700">
                  {doc.accessPassword}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 border-b border-dashed border-slate-300 pb-3">
            {doc.lines.map((line, idx) => (
              <div key={idx} className="flex items-baseline justify-between gap-4">
                <span className="text-slate-600">{line.label}</span>
                <span className="font-semibold text-right tabular-nums">{line.value}</span>
              </div>
            ))}
          </div>

          <div className="text-[11px] text-slate-500 leading-relaxed text-center">
            {doc.footerNote}
          </div>
        </div>

        <div className="px-5 py-4 bg-white border-t border-slate-200 flex items-center justify-end gap-3 no-print">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Fechar
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Comprovante</span>
          </button>
        </div>
      </div>
    </div>
  );
};
