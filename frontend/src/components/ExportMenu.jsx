import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, FileSpreadsheet, Image as ImageIcon, ChevronDown } from 'lucide-react';
import Button from './ui/Button';
import Spinner from './ui/Spinner';
import { useToast } from './ui/Toast';

// Small dropdown that offers PDF / Excel / Image export for one record.
// `onExport(kind)` does the work for kind ∈ 'pdf' | 'excel' | 'image' and may
// return a promise; a spinner shows while it runs.
export default function ExportMenu({ onExport, label = 'Export', size = 'sm', variant = 'outline' }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const run = async (kind) => {
    setOpen(false);
    setBusy(kind);
    try {
      await onExport(kind);
    } catch (err) {
      toast({ message: err?.message || 'Export failed', type: 'error' });
    } finally {
      setBusy('');
    }
  };

  const items = [
    ['pdf', 'PDF', FileText],
    ['excel', 'Excel', FileSpreadsheet],
    ['image', 'Image (PNG)', ImageIcon],
  ];

  return (
    <div className="relative inline-block" ref={ref}>
      <Button variant={variant} size={size} onClick={() => setOpen((v) => !v)} disabled={!!busy}>
        {busy ? <Spinner size="sm" className="mr-1.5" /> : <Download size={13} className="mr-1.5" />}
        {label}
        <ChevronDown size={13} className="ml-1" />
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 bg-white border rounded-lg shadow-lg py-1">
          {items.map(([kind, lbl, Icon]) => (
            <button
              key={kind}
              onClick={() => run(kind)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Icon size={15} className="text-gray-500" /> {lbl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
