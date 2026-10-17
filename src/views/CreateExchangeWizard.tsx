'use client';

import React, { useState } from 'react';
import { useOptionalDemoData } from '@/context/DemoDataContext';
import { useOptionalRealData } from '@/context/RealDataContext';
import { ThemeKey, Currency } from '@/types';
import { inferThemeFromDate, THEME_CONFIG } from '@/lib/theme';
import { RibbonDivider } from '@/components/RibbonDivider';

export const CreateExchangeWizard: React.FC = () => {
  const real = useOptionalRealData();
  const demo = useOptionalDemoData();
  const navigateTo = real ? real.navigateTo : (demo?.navigateTo || (() => {}));

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form states
  const [eventDate, setEventDate] = useState('2026-12-25');
  const [manualTheme, setManualTheme] = useState<ThemeKey | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [registrationDeadline, setRegistrationDeadline] = useState('2026-12-18');
  const [budgetAmount, setBudgetAmount] = useState<number>(15000);
  const [currency, setCurrency] = useState<Currency>('CRC');
  const [requiresApproval, setRequiresApproval] = useState(true);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Date inference (NEVER based on current date)
  const inferred = inferThemeFromDate(eventDate);
  const effectiveTheme = manualTheme || inferred.theme;

  const handleNextStep1 = () => {
    setStep(2);
  };

  const handleNextStep2 = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) {
      errs.name = 'Por favor escribe un nombre para el intercambio.';
    }
    if (!eventDate) {
      errs.eventDate = 'Selecciona la fecha de entrega de los regalos.';
    }
    if (!registrationDeadline) {
      errs.registrationDeadline = 'Selecciona la fecha límite de inscripción.';
    } else if (eventDate && registrationDeadline > eventDate) {
      errs.registrationDeadline = 'La fecha límite de inscripción no puede ser posterior a la fecha del evento.';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep(3);
  };

  const handleNextStep3 = () => {
    const errs: Record<string, string> = {};
    if (!budgetAmount || budgetAmount <= 0) {
      errs.budget = 'Indica un monto de presupuesto válido.';
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep(4);
  };

  const handleConfirmCreate = async () => {
    if (real) {
      const res = await real.createExchange({
        name: name.trim(),
        description: description.trim() || 'Intercambio organizado a través de Papelito.',
        eventDate,
        registrationDeadline,
        budgetAmount,
        currency,
        suggestedTheme: (inferred.theme || 'general') as 'navidad' | 'amistad' | 'cumpleanos' | 'general',
        selectedTheme: (effectiveTheme || 'general') as 'navidad' | 'amistad' | 'cumpleanos' | 'general',
        requiresApproval,
      });

      if (res.success && res.exchangeId) {
        navigateTo('intercambio_detalle', res.exchangeId);
      }
    } else if (demo) {
      const createdId = demo.createExchange({
        name: name.trim(),
        description: description.trim() || 'Intercambio organizado a través de Papelito.',
        eventDate,
        registrationDeadline,
        budgetAmount,
        currency,
        requiresApproval,
        manualThemeOverride: manualTheme || undefined,
      });

      navigateTo('intercambio_detalle', createdId);
    }
  };

  return (
    <div
      className="wizard-container animate-fade-in"
      style={{
        maxWidth: '520px',
        margin: '0 auto',
        padding: '1.25rem 1rem 5rem 1rem',
      }}
    >
      <button
        onClick={() => navigateTo('intercambios_lista')}
        className="btn-back"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          fontSize: '0.9rem',
          fontWeight: 600,
          cursor: 'pointer',
          padding: '0.5rem 0',
          marginBottom: '0.75rem',
        }}
      >
        ← Volver a mis intercambios
      </button>

      {/* Wizard Step Progress */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.5rem',
          }}
        >
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--color-frambuesa)',
              textTransform: 'none',
              letterSpacing: '0.05em',
            }}
          >
            Paso {step} de 4
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {step === 1 && 'Ocasión y tema visual'}
            {step === 2 && 'Fechas y nombre'}
            {step === 3 && 'Presupuesto y reglas'}
            {step === 4 && 'Revisión final'}
          </span>
        </div>

        {/* Progress track */}
        <div
          style={{
            height: '6px',
            backgroundColor: '#E2E8F0',
            borderRadius: '3px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(step / 4) * 100}%`,
              backgroundColor: 'var(--color-frambuesa)',
              transition: 'width 0.25s ease',
            }}
          />
        </div>
      </div>

      {/* STEP 1: Ocasión y Tema visual */}
      {step === 1 && (
        <div
          className="step-card"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid var(--border-subtle)',
            padding: '1.5rem',
            boxShadow: '0 6px 20px rgba(70, 36, 93, 0.05)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.45rem',
              fontWeight: 800,
              color: 'var(--color-tinta)',
              margin: '0 0 0.5rem 0',
            }}
          >
            1. Ocasión y tema visual
          </h2>

          <p
            style={{
              fontSize: '0.88rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.45,
              margin: '0 0 1.25rem 0',
            }}
          >
            El tema visual se asocia a la <strong>fecha programada del intercambio</strong> o a
            tu selección manual. No cambia con el calendario actual ni por la fecha de tu teléfono.
          </p>

          {/* Preliminary Event Date Picker for theme inference */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              htmlFor="event-date-step1"
              style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--color-tinta)',
                marginBottom: '0.35rem',
              }}
            >
              Fecha prevista para el intercambio:
            </label>
            <input
              id="event-date-step1"
              type="date"
              value={eventDate}
              onChange={(e) => {
                setEventDate(e.target.value);
                // Also auto-update deadline to 7 days before
                if (e.target.value) {
                  const d = new Date(e.target.value);
                  d.setDate(d.getDate() - 7);
                  setRegistrationDeadline(d.toISOString().split('T')[0]);
                }
              }}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '12px',
                border: '1.5px solid var(--border-subtle)',
                fontSize: '0.95rem',
                fontFamily: 'var(--font-body)',
              }}
            />
          </div>

          {/* Automatic Date Inference Result Banner */}
          <div
            style={{
              backgroundColor: THEME_CONFIG[inferred.theme].badgeBg,
              border: `1px solid ${THEME_CONFIG[inferred.theme].accentColor}33`,
              borderRadius: '14px',
              padding: '0.85rem 1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                color: THEME_CONFIG[inferred.theme].badgeText,
                textTransform: 'none',
                marginBottom: '0.25rem',
              }}
            >
              Sugerencia automática por fecha del evento:
            </div>
            <strong
              style={{
                display: 'block',
                fontSize: '0.95rem',
                color: 'var(--color-tinta)',
                marginBottom: '0.25rem',
              }}
            >
              Tema sugerido: {THEME_CONFIG[inferred.theme].label}
            </strong>
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                margin: 0,
                lineHeight: 1.35,
              }}
            >
              {inferred.reason}
            </p>
          </div>

          {/* Manual Theme Selector */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: 'var(--color-tinta)',
                marginBottom: '0.65rem',
              }}
            >
              Selector manual de tema (anula o confirma la sugerencia):
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
              {(Object.keys(THEME_CONFIG) as ThemeKey[]).map((themeKey) => {
                const meta = THEME_CONFIG[themeKey];
                const isSelected = effectiveTheme === themeKey;
                return (
                  <button
                    key={themeKey}
                    type="button"
                    onClick={() => setManualTheme(themeKey)}
                    style={{
                      textAlign: 'left',
                      padding: '0.85rem',
                      borderRadius: '14px',
                      border: isSelected
                        ? '2px solid var(--color-frambuesa)'
                        : '1.5px solid var(--border-subtle)',
                      backgroundColor: isSelected ? meta.bgSubtle : '#FFFFFF',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '0.35rem',
                      }}
                    >
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: meta.accentColor,
                        }}
                      />
                      {isSelected && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: 'var(--color-frambuesa)',
                          }}
                        >
                          ✓ Activo
                        </span>
                      )}
                    </div>
                    <strong
                      style={{
                        display: 'block',
                        fontSize: '0.85rem',
                        color: 'var(--color-tinta)',
                        lineHeight: 1.25,
                      }}
                    >
                      {meta.label}
                    </strong>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.3,
                        display: 'block',
                        marginTop: '0.2rem',
                      }}
                    >
                      {meta.tagline}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleNextStep1}
            className="btn-primary"
            style={{
              width: '100%',
              minHeight: '48px',
              backgroundColor: 'var(--color-frambuesa)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '14px',
              fontSize: '0.96rem',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              cursor: 'pointer',
            }}
          >
            Continuar a detalles del evento →
          </button>
        </div>
      )}

      {/* STEP 2: Nombre y Fechas */}
      {step === 2 && (
        <div
          className="step-card"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid var(--border-subtle)',
            padding: '1.5rem',
            boxShadow: '0 6px 20px rgba(70, 36, 93, 0.05)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.45rem',
              fontWeight: 800,
              color: 'var(--color-tinta)',
              margin: '0 0 0.5rem 0',
            }}
          >
            2. Nombre y fechas clave
          </h2>

          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              margin: '0 0 1.25rem 0',
            }}
          >
            Zona horaria del evento: <strong>America/Costa_Rica</strong>
          </p>

          {/* Exchange Name */}
          <div style={{ marginBottom: '1.15rem' }}>
            <label
              htmlFor="exchange-name"
              style={{
                display: 'block',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: 'var(--color-tinta)',
                marginBottom: '0.35rem',
              }}
            >
              Nombre del intercambio *
            </label>
            <input
              id="exchange-name"
              type="text"
              placeholder="Ej. Navidad Familia Rodríguez 2026"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
              }}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '12px',
                border: `1.5px solid ${errors.name ? '#E53E3E' : 'var(--border-subtle)'}`,
                fontSize: '0.95rem',
              }}
            />
            {errors.name && (
              <span style={{ color: '#E53E3E', fontSize: '0.78rem', marginTop: '0.25rem', display: 'block' }}>
                {errors.name}
              </span>
            )}
          </div>

          {/* Description */}
          <div style={{ marginBottom: '1.15rem' }}>
            <label
              htmlFor="exchange-desc"
              style={{
                display: 'block',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: 'var(--color-tinta)',
                marginBottom: '0.35rem',
              }}
            >
              Instrucciones breves o lugar de entrega (opcional)
            </label>
            <textarea
              id="exchange-desc"
              rows={3}
              placeholder="Ej. Traer el regalo envuelto sin remitente para la cena del viernes."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '12px',
                border: '1.5px solid var(--border-subtle)',
                fontSize: '0.9rem',
                fontFamily: 'var(--font-body)',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Event Date */}
          <div style={{ marginBottom: '1.15rem' }}>
            <label
              htmlFor="event-date-step2"
              style={{
                display: 'block',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: 'var(--color-tinta)',
                marginBottom: '0.35rem',
              }}
            >
              Fecha de entrega de regalos *
            </label>
            <input
              id="event-date-step2"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '12px',
                border: '1.5px solid var(--border-subtle)',
                fontSize: '0.95rem',
              }}
            />
          </div>

          {/* Registration Deadline */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="reg-deadline"
              style={{
                display: 'block',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: 'var(--color-tinta)',
                marginBottom: '0.35rem',
              }}
            >
              Fecha límite para confirmar participación *
            </label>
            <input
              id="reg-deadline"
              type="date"
              value={registrationDeadline}
              onChange={(e) => {
                setRegistrationDeadline(e.target.value);
                if (errors.registrationDeadline) {
                  setErrors((prev) => ({ ...prev, registrationDeadline: '' }));
                }
              }}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '12px',
                border: `1.5px solid ${errors.registrationDeadline ? '#E53E3E' : 'var(--border-subtle)'}`,
                fontSize: '0.95rem',
              }}
            />
            {errors.registrationDeadline && (
              <span style={{ color: '#E53E3E', fontSize: '0.78rem', marginTop: '0.25rem', display: 'block' }}>
                {errors.registrationDeadline}
              </span>
            )}
            <small style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
              Podés realizar el sorteo cuando el grupo esté listo, con al menos 3 personas aprobadas.
              Al sortear se cierra la inscripción.
            </small>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setStep(1)}
              style={{
                flex: 0.45,
                minHeight: '48px',
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--color-tinta)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ← Atrás
            </button>
            <button
              onClick={handleNextStep2}
              className="btn-primary"
              style={{
                flex: 1,
                minHeight: '48px',
                backgroundColor: 'var(--color-frambuesa)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '14px',
                fontSize: '0.96rem',
                fontWeight: 700,
                fontFamily: 'var(--font-heading)',
                cursor: 'pointer',
              }}
            >
              Siguiente: Presupuesto →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Presupuesto y Reglas */}
      {step === 3 && (
        <div
          className="step-card"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid var(--border-subtle)',
            padding: '1.5rem',
            boxShadow: '0 6px 20px rgba(70, 36, 93, 0.05)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.45rem',
              fontWeight: 800,
              color: 'var(--color-tinta)',
              margin: '0 0 0.5rem 0',
            }}
          >
            3. Presupuesto y reglas de acceso
          </h2>

          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              margin: '0 0 1.25rem 0',
            }}
          >
            Establece un valor orientativo para que todos los regalos sean equilibrados.
          </p>

          {/* Currency selector (CRC default, USD alternative) */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: 'var(--color-tinta)',
                marginBottom: '0.45rem',
              }}
            >
              Moneda del presupuesto
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setCurrency('CRC');
                  if (budgetAmount === 25) setBudgetAmount(15000);
                }}
                style={{
                  padding: '0.75rem',
                  borderRadius: '12px',
                  border: currency === 'CRC' ? '2px solid var(--color-tinta)' : '1px solid var(--border-subtle)',
                  backgroundColor: currency === 'CRC' ? 'var(--surface-subtle)' : '#FFFFFF',
                  fontWeight: 700,
                  color: 'var(--color-tinta)',
                  cursor: 'pointer',
                }}
              >
                Colones costarricenses (₡ CRC)
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrency('USD');
                  if (budgetAmount === 15000) setBudgetAmount(25);
                }}
                style={{
                  padding: '0.75rem',
                  borderRadius: '12px',
                  border: currency === 'USD' ? '2px solid var(--color-tinta)' : '1px solid var(--border-subtle)',
                  backgroundColor: currency === 'USD' ? 'var(--surface-subtle)' : '#FFFFFF',
                  fontWeight: 700,
                  color: 'var(--color-tinta)',
                  cursor: 'pointer',
                }}
              >
                Dólares estadounidenses ($ USD)
              </button>
            </div>
          </div>

          {/* Budget amount input */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="budget-amount"
              style={{
                display: 'block',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: 'var(--color-tinta)',
                marginBottom: '0.35rem',
              }}
            >
              Monto orientativo ({currency}) *
            </label>
            <input
              id="budget-amount"
              type="number"
              min="1"
              step={currency === 'CRC' ? '1000' : '5'}
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '12px',
                border: '1.5px solid var(--border-subtle)',
                fontSize: '1.1rem',
                fontWeight: 700,
              }}
            />
          </div>

          {/* Invitation Access Control */}
          <div
            style={{
              backgroundColor: 'var(--surface-subtle)',
              borderRadius: '14px',
              padding: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                style={{
                  marginTop: '0.15rem',
                  accentColor: 'var(--color-frambuesa)',
                  width: '18px',
                  height: '18px',
                }}
              />
              <div>
                <strong style={{ fontSize: '0.88rem', color: 'var(--color-tinta)', display: 'block' }}>
                  Aprobación previa del organizador
                </strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.35, display: 'block', marginTop: '0.2rem' }}>
                  Recomendado para evitar que personas no deseadas ingresen al intercambio si el
                  enlace es reenviado en grupos grandes de WhatsApp.
                </span>
              </div>
            </label>
          </div>

          {/* Exclusions advisory note per Plan Section 3 */}
          <div
            style={{
              backgroundColor: '#FFFDF5',
              border: '1px solid #FEF3D6',
              borderRadius: '12px',
              padding: '0.85rem',
              fontSize: '0.78rem',
              color: '#7A5200',
              lineHeight: 1.4,
              marginBottom: '1.5rem',
            }}
          >
            ℹ️ <strong>Nota sobre exclusiones:</strong> Como organizador podrás configurar reglas
            para evitar que ciertas personas se regalen mutuamente (por ejemplo parejas). Ten en
            cuenta que un número excesivo de exclusiones puede hacer matemáticamente imposible
            el sorteo.
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setStep(2)}
              style={{
                flex: 0.45,
                minHeight: '48px',
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--color-tinta)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ← Atrás
            </button>
            <button
              onClick={handleNextStep3}
              className="btn-primary"
              style={{
                flex: 1,
                minHeight: '48px',
                backgroundColor: 'var(--color-frambuesa)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '14px',
                fontSize: '0.96rem',
                fontWeight: 700,
                fontFamily: 'var(--font-heading)',
                cursor: 'pointer',
              }}
            >
              Revisar y confirmar →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Revisión final */}
      {step === 4 && (
        <div
          className="step-card"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid var(--border-subtle)',
            padding: '1.5rem',
            boxShadow: '0 6px 20px rgba(70, 36, 93, 0.05)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.45rem',
              fontWeight: 800,
              color: 'var(--color-tinta)',
              margin: '0 0 0.5rem 0',
            }}
          >
            4. Confirmar creación
          </h2>

          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              margin: '0 0 1.25rem 0',
            }}
          >
            Revisa los detalles antes de crear tu intercambio. Podrás compartir el enlace de
            inmediato.
          </p>

          <div
            style={{
              backgroundColor: 'var(--surface-subtle)',
              borderRadius: '16px',
              padding: '1.15rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              marginBottom: '1.5rem',
            }}
          >
            <div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'none' }}>
                Nombre
              </span>
              <strong style={{ display: 'block', fontSize: '1.1rem', color: 'var(--color-tinta)' }}>
                {name}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'none' }}>
                Tema visual
              </span>
              <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--color-frambuesa)' }}>
                {THEME_CONFIG[effectiveTheme].label}
              </strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'none' }}>
                  Fecha de entrega
                </span>
                <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--color-tinta)' }}>
                  {eventDate}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'none' }}>
                  Cierre de inscripción
                </span>
                <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--color-tinta)' }}>
                  {registrationDeadline}
                </strong>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'none' }}>
                  Presupuesto
                </span>
                <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--color-tinta)' }}>
                  {currency === 'CRC' ? `₡${budgetAmount.toLocaleString('es-CR')}` : `$${budgetAmount}`} {currency}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'none' }}>
                  Control de invitados
                </span>
                <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--color-tinta)' }}>
                  {requiresApproval ? 'Con aprobación previa' : 'Acceso directo'}
                </strong>
              </div>
            </div>
          </div>

          <RibbonDivider />

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              onClick={() => setStep(3)}
              style={{
                flex: 0.45,
                minHeight: '48px',
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--color-tinta)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ← Modificar
            </button>
            <button
              onClick={handleConfirmCreate}
              className="btn-primary"
              style={{
                flex: 1,
                minHeight: '48px',
                backgroundColor: 'var(--color-frambuesa)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '14px',
                fontSize: '1rem',
                fontWeight: 700,
                fontFamily: 'var(--font-heading)',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(112, 67, 162, 0.28)',
              }}
            >
              ✨ Crear intercambio ahora
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
