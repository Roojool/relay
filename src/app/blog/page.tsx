import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Relay — Freight Handoff Relay Desk',
  description: 'How Relay proves every shipment leg hands off to a legal, awake, certified driver — on a FalkorDB graph.',
};

export default function BlogPage() {
  return (
    <div className="wrap" style={{ padding: '48px 20px 80px' }}>
      <section style={{ border: '1.5px solid var(--ink-primary)', borderRadius: 'var(--radius-lg)', padding: '40px 48px', background: 'var(--card)' }}>
        <p className="mono" style={{ color: 'var(--clay-700)', marginBottom: '12px', letterSpacing: '0.16em' }}>Relay · Engineering Notes</p>
        <h1 className="editorial-headline" style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', margin: '0 0 16px 0', lineHeight: '1.05' }}>
          Freight Handoff Relay on the Graph
        </h1>
        <p style={{ fontSize: '1.05rem', color: 'var(--ink-secondary)', lineHeight: '1.6', maxWidth: '62ch', marginBottom: '24px' }}>
          Relay proves every shipment leg hands off to a legal, awake, certified driver. The plan lives on a FalkorDB graph where hubs,
          legs, drivers, trailer classes, HOS clocks, deadlines, and dock capacity are nodes, and coverage is discovered by real
          traversals — never denormalized foreign keys.
        </p>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', margin: '24px 0 10px 0', color: 'var(--ink-primary)' }}>The hero conflict (fictional)</h2>
        <p style={{ fontSize: '1rem', color: 'var(--ink-secondary)', lineHeight: '1.6', maxWidth: '62ch', marginBottom: '16px' }}>
          Leg L-31 (hazmat class 3, due 06:00) is driven by Driver Okafor with 47 minutes remaining on his HOS clock — the route needs
          3h12m. The only other hazmat-endorsed driver, Salas, is docked into a rest obligation. Petrov is endorsed but a 3-way split
          would violate the single-custody hazmat rule, and his HOS is borderline.
        </p>
        <p style={{ fontSize: '1rem', color: 'var(--ink-secondary)', lineHeight: '1.6', maxWidth: '62ch', marginBottom: '24px' }}>
          The valid repair: split L-31 at Hub Ravensgate — Okafor drives 40 minutes to meet post-rest Salas, who takes custody for the
          final 2h32m. Pair fits; triple split is rejected. An approval fact — "emergency-hos-exemption-okafor" — re-enables single-driver
          completion.
        </p>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', margin: '24px 0 10px 0', color: 'var(--ink-primary)' }}>Deterministic by design</h2>
        <p style={{ fontSize: '1rem', color: 'var(--ink-secondary)', lineHeight: '1.6', maxWidth: '62ch', marginBottom: '16px' }}>
          The plan checker and repair proposer are pure functions: same input, same output, every time. No clock, no randomness, no
          in-memory business-state fallback. If FalkorDB is unreachable, the API returns 503 — it never guesses.
        </p>
        <p style={{ fontSize: '1rem', color: 'var(--ink-secondary)', lineHeight: '1.6', maxWidth: '62ch' }}>
          Unknown trailer classes on legacy manifests surface truthfully as unknowns: the leg stays blocked until clarified, never
          auto-assigned. All fixture data is fictional.
        </p>
      </section>
    </div>
  );
}
