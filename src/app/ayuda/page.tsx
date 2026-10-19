import Link from 'next/link';
import { HelpCenter } from '@/components/HelpCenter';
export const metadata = { title: 'Ayuda — Papelito' };
export default function HelpPage() { return <main className="workshop-page compact-page"><Link href="/" className="paper-text-button">← Volver a Papelito</Link><h1>Siempre hay una mano cerca.</h1><HelpCenter /></main>; }
