import avatarCarlos from '../assets/images/avatar_carlos_mendoza_1794686058117.jpg';
import posTerminalImg from '../assets/images/product_pos_terminal_1794686058169.jpg';
import thermalPrinterImg from '../assets/images/product_thermal_printer_1794686058632.jpg';
import barcodeScannerImg from '../assets/images/product_barcode_scanner_1794686059257.jpg';
import cashDrawerImg from '../assets/images/product_cash_drawer_1794686059263.jpg';

export const USER_AVATAR = avatarCarlos;

export const PRODUCT_IMAGE_MAP: Record<string, string> = {
  pos_terminal: posTerminalImg,
  thermal_printer: thermalPrinterImg,
  barcode_scanner: barcodeScannerImg,
  cash_drawer: cashDrawerImg,
};

export const PRODUCT_IMAGE_OPTIONS = [
  { key: '', label: 'Sin imagen (ícono automático)' },
  { key: 'thermal_printer', label: 'Impresora Térmica POS' },
  { key: 'barcode_scanner', label: 'Escáner de Código 2D' },
  { key: 'cash_drawer', label: 'Cajón Monedero Eléctrico' },
  { key: 'pos_terminal', label: 'Terminal Touch All-in-One' },
];
