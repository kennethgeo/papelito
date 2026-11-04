import Link from 'next/link';
import { RibbonLogo } from '@/components/RibbonLogo';

export default function NotFound() {
  return (
    <main className="workshop-page compact-page">
      <section className="workshop-sheet">
        <RibbonLogo size="sm" />
        <h1>No encontramos esta página.</h1>
        <p>Puede que el enlace esté incompleto o que la página ya no exista. Si te llegó una invitación, pedile a quien organiza que te la vuelva a enviar.</p>
        <Link className="paper-button" href="/">Volver al inicio</Link>
      </section>
    </main>
  );
}
