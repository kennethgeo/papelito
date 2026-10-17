'use client';

import React, { useRef, useState } from 'react';
import { useOptionalDemoData } from '@/context/DemoDataContext';
import { useOptionalRealData } from '@/context/RealDataContext';
import { Wish, Currency } from '@/types';
import { RibbonDivider } from '@/components/RibbonDivider';

export const WishesListView: React.FC = () => {
  const real = useOptionalRealData();
  const demo = useOptionalDemoData();

  const userWishes: Wish[] = real
    ? real.myWishes.map((w) => ({
        id: w.id,
        title: w.title,
        description: w.description || '',
        url: w.url || '',
        approximatePrice: w.approximatePrice || undefined,
        currency: (w.currency || 'CRC') as Currency,
        priority: (w.priority || 'media') as Wish['priority'],
        selectedInExchanges: w.selectedInExchanges,
        createdAt: new Date().toISOString(),
      }))
    : (demo?.userWishes || []);

  const defaultCurrency: Currency = (real ? 'CRC' : demo?.userProfile.preferences.defaultCurrency || 'CRC') as Currency;

  const [isAdding, setIsAdding] = useState(false);
  const [editingWishId, setEditingWishId] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [approximatePrice, setApproximatePrice] = useState<number | ''>('');
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [priority, setPriority] = useState<Wish['priority']>('alta');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setUrl('');
    setApproximatePrice('');
    setCurrency(defaultCurrency);
    setPriority('alta');
    setFormError('');
    setIsAdding(false);
    setEditingWishId(null);
  };

  const handleStartEdit = (wish: Wish) => {
    setEditingWishId(wish.id);
    setTitle(wish.title);
    setDescription(wish.description || '');
    setUrl(wish.url || '');
    setApproximatePrice(wish.approximatePrice || '');
    setCurrency(wish.currency);
    setPriority(wish.priority);
    setIsAdding(true);
  };

  const handleSaveWish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    if (!title.trim()) {
      setFormError('Por favor escribe un título para el deseo o idea de regalo.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setFormError('');
    try {
      if (real) {
        const ok = await real.saveWish({
          id: editingWishId || undefined,
          title: title.trim(),
          description: description.trim() || undefined,
          url: url.trim() || undefined,
          approximatePrice: approximatePrice ? Number(approximatePrice) : undefined,
          currency,
          priority: priority as 'alta' | 'media' | 'baja',
        });
        if (!ok) {
          setFormError('No se pudo guardar el deseo en el servidor. Por favor intenta de nuevo.');
          return;
        }
      } else if (demo) {
        if (editingWishId) {
          demo.updateUserWish(editingWishId, {
            title: title.trim(),
            description: description.trim() || undefined,
            url: url.trim() || undefined,
            approximatePrice: approximatePrice ? Number(approximatePrice) : undefined,
            currency,
            priority,
          });
        } else {
          demo.addUserWish({
            title: title.trim(),
            description: description.trim() || undefined,
            url: url.trim() || undefined,
            approximatePrice: approximatePrice ? Number(approximatePrice) : undefined,
            currency,
            priority,
          });
        }
      }
      resetForm();
    } catch {
      setFormError('No se pudo conectar. Conservamos tu idea para volver a intentar.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDeleteWish = async (wishId: string) => {
    if (real) {
      const ok = await real.deleteWish(wishId);
      if (!ok) {
        setFormError('No se pudo eliminar el deseo en el servidor.');
      }
    } else if (demo) {
      demo.deleteUserWish(wishId);
    }
  };

  const formatCurrency = (amount: number, cur: string) => {
    if (cur === 'CRC') {
      return `₡${amount.toLocaleString('es-CR')}`;
    }
    return `$${amount.toLocaleString('en-US')}`;
  };

  const getPriorityBadge = (p: Wish['priority']) => {
    const badges = {
      alta: { label: 'Prioridad alta', bg: '#EDE5F5', text: '#59317C' },
      media: { label: 'Prioridad media', bg: '#FEF3D6', text: '#7A5200' },
      baja: { label: 'Prioridad baja', bg: '#EDE5F5', text: '#46245D' },
    }[p];

    return (
      <span
        style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          textTransform: 'none',
          letterSpacing: '0.04em',
          backgroundColor: badges.bg,
          color: badges.text,
          padding: '0.2rem 0.55rem',
          borderRadius: '999px',
        }}
      >
        {badges.label}
      </span>
    );
  };

  return (
    <div
      className="wishes-page animate-fade-in"
      style={{
        maxWidth: '560px',
        margin: '0 auto',
        padding: '1.25rem 1rem 5rem 1rem',
      }}
    >
      {/* Header & Add Button */}
      <div className="paper-secondary-heading"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
          gap: '0.75rem',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.75rem',
              fontWeight: 800,
              color: 'var(--color-tinta)',
              margin: '0 0 0.2rem 0',
              lineHeight: 1.15,
            }}
          >
            Mis deseos
          </h1>
          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            Dejá unas pistas para quien te regale.
          </p>
        </div>

        {!isAdding && (
          <button
            onClick={() => {
              resetForm();
              setIsAdding(true);
            }}
            className="btn-create"
            style={{
              backgroundColor: 'var(--color-frambuesa)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '14px',
              padding: '0.75rem 1.15rem',
              fontFamily: 'var(--font-heading)',
              fontSize: '0.92rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 12px rgba(112, 67, 162, 0.25)',
              flexShrink: 0,
            }}
          >
            <span>+ Añadir deseo</span>
          </button>
        )}
      </div>

      {/* Add / Edit Form Card */}
      {isAdding && (
        <form
          onSubmit={handleSaveWish}
          className="wish-form animate-fade-in"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            border: '2px solid var(--color-celeste)',
            padding: '1.35rem',
            marginBottom: '1.5rem',
            boxShadow: '0 8px 24px rgba(70, 36, 93, 0.08)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '1.25rem',
                fontWeight: 800,
                color: 'var(--color-tinta)',
                margin: 0,
              }}
            >
              {editingWishId ? 'Editar idea de regalo' : 'Nueva idea de regalo'}
            </h2>
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              ✕ Cancelar
            </button>
          </div>

          {formError && (
            <div
              role="alert"
              style={{
                backgroundColor: '#FFF5F5',
                border: '1px solid #FEB2B2',
                color: '#C53030',
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.82rem',
                marginBottom: '1rem',
              }}
            >
              {formError}
            </div>
          )}

          {/* Title */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="wish-title"
              style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--color-tinta)',
                marginBottom: '0.35rem',
              }}
            >
              Título o artículo deseado *
            </label>
            <input
              id="wish-title"
              type="text"
              placeholder="Ej. Café de especialidad Tarrazú en grano"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '12px',
                border: '1.5px solid var(--border-subtle)',
                fontSize: '0.95rem',
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="wish-desc"
              style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--color-tinta)',
                marginBottom: '0.35rem',
              }}
            >
              Detalles, color o especificaciones (opcional)
            </label>
            <textarea
              id="wish-desc"
              rows={2}
              placeholder="Ej. Tueste medio, bolsa de 340g. Evitar sabores añadidos."
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

          {/* Reference Link */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="wish-url"
              style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--color-tinta)',
                marginBottom: '0.35rem',
              }}
            >
              Enlace de referencia de tienda (opcional)
            </label>
            <input
              id="wish-url"
              type="url"
              placeholder="https://tienda.co.cr/articulo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '12px',
                border: '1.5px solid var(--border-subtle)',
                fontSize: '0.9rem',
              }}
            />
          </div>

          {/* Price & Currency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.65rem', marginBottom: '1rem' }}>
            <div>
              <label
                htmlFor="wish-price"
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--color-tinta)',
                  marginBottom: '0.35rem',
                }}
              >
                Precio aproximado
              </label>
              <input
                id="wish-price"
                type="number"
                min="0"
                placeholder="Ej. 7500"
                value={approximatePrice}
                onChange={(e) => setApproximatePrice(e.target.value === '' ? '' : Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '12px',
                  border: '1.5px solid var(--border-subtle)',
                  fontSize: '0.95rem',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="wish-currency"
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--color-tinta)',
                  marginBottom: '0.35rem',
                }}
              >
                Moneda
              </label>
              <select
                id="wish-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '12px',
                  border: '1.5px solid var(--border-subtle)',
                  fontSize: '0.95rem',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <option value="CRC">CRC (₡)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>

          {/* Priority */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--color-tinta)',
                marginBottom: '0.35rem',
              }}
            >
              Nivel de prioridad para quien te regale
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.45rem' }}>
              {(['alta', 'media', 'baja'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  style={{
                    padding: '0.6rem',
                    borderRadius: '10px',
                    border: priority === p ? '2px solid var(--color-frambuesa)' : '1px solid var(--border-subtle)',
                    backgroundColor: priority === p ? 'var(--surface-subtle)' : '#FFFFFF',
                    fontWeight: priority === p ? 700 : 500,
                    fontSize: '0.82rem',
                    textTransform: 'capitalize',
                    color: 'var(--color-tinta)',
                    cursor: 'pointer',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem' }}>
            <button
              type="button"
              onClick={resetForm}
              style={{
                flex: 0.4,
                padding: '0.75rem',
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--color-tinta)',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              aria-busy={saving}
              style={{
                flex: 1,
                padding: '0.75rem',
                backgroundColor: 'var(--color-frambuesa)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 700,
                fontFamily: 'var(--font-heading)',
                cursor: 'pointer',
              }}
            >
              {saving ? 'Guardando tu idea…' : editingWishId ? 'Guardar cambios' : 'Añadir a mis deseos'}
            </button>
          </div>
        </form>
      )}

      {/* Wishes List */}
      {userWishes.length === 0 ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            border: '1px dashed var(--border-subtle)',
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>✨</div>
          <h3
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.2rem',
              color: 'var(--color-tinta)',
              margin: '0 0 0.35rem 0',
            }}
          >
            Tu lista de deseos está vacía
          </h3>
          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              margin: '0 0 1.25rem 0',
              lineHeight: 1.45,
            }}
          >
            Añade al menos dos o tres ideas de diferentes rangos de precio para que tu amigo
            secreto tenga buenas opciones para elegir.
          </p>
          <button
            onClick={() => setIsAdding(true)}
            style={{
              backgroundColor: 'var(--color-frambuesa)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '12px',
              padding: '0.75rem 1.25rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Añadir mi primer deseo
          </button>
        </div>
      ) : (
        <div className="paper-my-wishes">
          {userWishes.map((wish) => {
            const availableExchanges = (real ? real.exchanges : (demo?.exchanges || [])).filter(
              (ex) => (ex.currentUserMemberStatus || 'approved') === 'approved'
            );
            const selectedIds = wish.selectedInExchanges || [];

            const handleToggleExchange = async (exchangeId: string, currentlySelected: boolean) => {
              setFormError('');
              if (real) {
                const ok = await real.toggleWishInExchange(exchangeId, wish.id, !currentlySelected);
                if (!ok) {
                  setFormError('No se pudo actualizar la selección del deseo para el intercambio.');
                }
              } else if (demo) {
                const nextSelected = currentlySelected
                  ? selectedIds.filter((id) => id !== exchangeId)
                  : [...selectedIds, exchangeId];
                demo.updateUserWish(wish.id, { selectedInExchanges: nextSelected });
              }
            };

            return (
              <div
                key={wish.id}
                className="paper-my-wish"
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '18px',
                  border: '1px solid var(--border-subtle)',
                  padding: '1.15rem',
                  boxShadow: '0 2px 8px rgba(70, 36, 93, 0.04)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    marginBottom: '0.45rem',
                  }}
                >
                  <h3
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontSize: '1.08rem',
                      fontWeight: 700,
                      color: 'var(--color-tinta)',
                      margin: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    {wish.title}
                  </h3>
                  {getPriorityBadge(wish.priority)}
                </div>

                {wish.description && (
                  <p
                    style={{
                      fontSize: '0.88rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.45,
                      margin: '0 0 0.75rem 0',
                    }}
                  >
                    {wish.description}
                  </p>
                )}

                {availableExchanges.length > 0 && (
                  <div
                    style={{
                      backgroundColor: 'var(--surface-subtle)',
                      borderRadius: '12px',
                      padding: '0.65rem 0.75rem',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: 'var(--color-tinta)',
                        marginBottom: '0.4rem',
                      }}
                    >
                      Compartir esta idea en mis intercambios:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                      {availableExchanges.map((ex) => {
                        const isSelected = selectedIds.includes(ex.id);
                        return (
                          <label
                            key={ex.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.25rem 0.6rem',
                              borderRadius: '999px',
                              fontSize: '0.76rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              backgroundColor: isSelected ? '#EDE5F5' : '#FFFFFF',
                              color: 'var(--color-tinta)',
                              border: isSelected
                                ? '1.5px solid var(--color-frambuesa)'
                                : '1px solid var(--border-subtle)',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => void handleToggleExchange(ex.id, isSelected)}
                              style={{ margin: 0 }}
                            />
                            <span>{ex.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    paddingTop: '0.65rem',
                    borderTop: '1px solid #F1F5F9',
                  }}
                >
                  <div>
                    {wish.approximatePrice && (
                      <span
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          color: 'var(--color-tinta)',
                        }}
                      >
                        Precio: {formatCurrency(wish.approximatePrice, wish.currency)}
                      </span>
                    )}
                    {wish.url && (
                      <div style={{ marginTop: '0.2rem' }}>
                        <a
                          href={wish.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: '0.78rem',
                            color: 'var(--color-frambuesa)',
                            textDecoration: 'underline',
                            fontWeight: 600,
                          }}
                        >
                          Enlace de referencia ↗
                        </a>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      onClick={() => handleStartEdit(wish)}
                      style={{
                        background: 'none',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '0.35rem 0.65rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: 'var(--color-tinta)',
                        cursor: 'pointer',
                      }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDeleteWish(wish.id)}
                      style={{
                        background: 'none',
                        border: '1px solid #FEB2B2',
                        borderRadius: '8px',
                        padding: '0.35rem 0.65rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: '#C53030',
                        cursor: 'pointer',
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RibbonDivider />

      {/* Advice & Privacy Box */}
      <div className="paper-wishes-privacy"
        style={{
          backgroundColor: '#FFFDF5',
          border: '1px solid #FEF3D6',
          borderRadius: '16px',
          padding: '1rem',
          fontSize: '0.82rem',
          color: '#7A5200',
          lineHeight: 1.45,
        }}
      >
        Los deseos que compartís en un intercambio los verá quien te regale.
        Dejá ideas y preferencias; evitá direcciones o datos sensibles.
      </div>
    </div>
  );
};
