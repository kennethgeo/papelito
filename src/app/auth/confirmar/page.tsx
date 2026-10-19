import Link from 'next/link';
import { PaperAccessCard } from '@/components/PaperAccessCard';
export const metadata={title:'Confirmar acceso — Papelito'};
export default function ConfirmAccessPage(){return <main className="workshop-page compact-page"><Link className="paper-text-button" href="/">← Volver a Papelito</Link><h1>Confirmá que sos vos.</h1><p>Volvé a entrar para administrar tus métodos de acceso o realizar cambios sensibles.</p><section className="workshop-sheet"><PaperAccessCard/></section></main>;}
