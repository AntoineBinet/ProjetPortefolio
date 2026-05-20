import { useEffect, useRef, useState, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { useAdmin, useEditable, getByPath } from './AdminContext';

// N'autorise que les URL sûres (http/https/mailto/tel/ancres/chemins relatifs) —
// bloque notamment javascript:. allowData : autorise en plus les data:image/*.
function safeUrl(u, { allowData = false } = {}) {
  const s = String(u ?? '').trim();
  if (!s) return '#';
  if (/^(https?:|mailto:|tel:|#|\/|\.)/i.test(s)) return s;
  if (allowData && /^data:image\//i.test(s)) return s;
  return '#';
}

/**
 * Lien éditable : en mode lecture, c'est un simple <a>. En mode admin, le
 * survol affiche un petit bouton "✎ URL" qui ouvre un prompt pour modifier
 * l'href stocké à `path`. Le clic sur le lien est intercepté pour ne pas
 * naviguer en mode édition.
 *
 * Props supplémentaires par rapport à <a> :
 *   - path        : chemin où stocker l'URL (ex "documents.0.url")
 *   - children    : rendu intérieur (label, icône, etc.)
 *   - placeholder : URL par défaut si vide ("#" en lecture, label "URL" en édition)
 */
export function EditableLink({ path, children, href, className = '', onClick, target, rel, ...rest }) {
  const { content, setField } = useAdmin();
  const isEdit = useEditable();
  const stored = path ? getByPath(content, path) : undefined;
  const url = safeUrl(stored ?? href ?? '#');

  const onEditUrl = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!path) return;
    const next = window.prompt('URL du lien (laisser vide pour #) :', url || '');
    if (next === null) return;
    setField(path, next.trim() || '#');
  }, [path, url, setField]);

  const handleClick = useCallback((e) => {
    if (isEdit) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick?.(e);
  }, [isEdit, onClick]);

  const cls = `${className} ${isEdit ? 'ed-link' : ''}`.trim();

  return (
    <a
      href={url}
      target={target}
      rel={rel}
      className={cls}
      onClick={handleClick}
      data-ed-link-path={path}
      {...rest}
    >
      {children}
      {isEdit && path && (
        <button
          type="button"
          className="ed-link-edit"
          onClick={onEditUrl}
          title={`Modifier l'URL${url ? ' — ' + url : ''}`}
          aria-label="Modifier l'URL du lien"
        >✎</button>
      )}
    </a>
  );
}

/**
 * Wrapper pour bloquer la navigation d'un <a> hôte en mode édition (sans
 * permettre l'édition de l'URL — utile pour les ancres internes ou les liens
 * dont l'URL est calculée et non stockée dans content.json).
 */
export function NavGuardLink({ children, onClick, className = '', ...rest }) {
  const isEdit = useEditable();
  const handleClick = useCallback((e) => {
    if (isEdit) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick?.(e);
  }, [isEdit, onClick]);
  return <a {...rest} className={className} onClick={handleClick}>{children}</a>;
}

/**
 * <Editable as="h1" path="hero.titleLight">
 *   - Lecture : rendu simple (texte brut OU dangerouslySetInnerHTML si html=true).
 *   - Mode édition : élément contentEditable, save sur blur.
 *
 * Props :
 *   - path        : chemin dot.notation dans content.json (ex "hero.sub", "metiers.0.name")
 *   - as          : balise (default: span)
 *   - html        : true → champ multi-balise (titres avec <em>, <br/>, etc.)
 *   - multiline   : true → autorise newlines (Enter ne valide pas)
 *   - placeholder : texte fallback si vide
 *   - className   : classe additionnelle (la classe "ed-mark" est ajoutée auto en mode édition)
 */
export function Editable({
  path,
  as = 'span',
  html = false,
  multiline = false,
  placeholder = '',
  className = '',
  children,
  ...rest
}) {
  const { setField, content } = useAdmin();
  const isEdit = useEditable();
  const ref = useRef(null);

  const value = path ? getByPath(content, path) : null;
  const display = value != null && value !== '' ? value : (children ?? placeholder ?? '');

  // Synchronise le DOM si la valeur change depuis l'extérieur (discard, etc.)
  // tant que l'utilisateur n'est pas en train de taper.
  useEffect(() => {
    if (!isEdit || !ref.current) return;
    if (document.activeElement === ref.current) return;
    if (html) {
      const safe = DOMPurify.sanitize(display || '');
      if (ref.current.innerHTML !== safe) ref.current.innerHTML = safe;
    } else {
      if (ref.current.innerText !== (display || '')) ref.current.innerText = display || '';
    }
  }, [display, isEdit, html]);

  const onBlur = useCallback((e) => {
    if (!path) return;
    const next = html
      ? DOMPurify.sanitize(e.currentTarget.innerHTML)
      : e.currentTarget.innerText;
    if (next !== value) setField(path, next);
  }, [path, value, html, setField]);

  const onKeyDown = useCallback((e) => {
    if (!multiline && e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }, [multiline]);

  const Tag = as;

  if (!isEdit) {
    if (html) {
      return <Tag className={className} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(display) }} {...rest} />;
    }
    return <Tag className={className} {...rest}>{display}</Tag>;
  }

  const cls = `${className} ed-mark`.trim();
  if (html) {
    return (
      <Tag
        ref={ref}
        className={cls}
        contentEditable
        suppressContentEditableWarning
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        data-ed-path={path}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(display) }}
        {...rest}
      />
    );
  }
  return (
    <Tag
      ref={ref}
      className={cls}
      contentEditable
      suppressContentEditableWarning
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      data-ed-path={path}
      {...rest}
    >{display}</Tag>
  );
}

/**
 * Image éditable. En mode admin, click → file picker → upload → setField(path).
 * Si pas de path ou pas en mode admin → simple <img>.
 *
 * Props :
 *   - path  : chemin où stocker l'URL custom dans content.imageOverrides
 *             (ex "hero.cover", "agences.0.photo")
 *   - src   : src par défaut (asset bundle) si aucun override
 *   - alt   : alt
 *   - className, etc.
 */
export function EditableImage({ path, src, alt = '', className = '', ...rest }) {
  const { content, setField, uploadImage } = useAdmin();
  const isEdit = useEditable();
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);

  const overridePath = path ? `imageOverrides.${path}` : null;
  const override = overridePath ? getByPath(content, overridePath) : null;
  const finalSrc = safeUrl(override || src, { allowData: true });

  const onPick = useCallback((e) => {
    const f = e.target.files && e.target.files[0];
    if (!f || !overridePath) return;
    setUploading(true);
    setErr(null);
    uploadImage(f).then(res => {
      if (res.ok) {
        setField(overridePath, res.url);
      } else {
        setErr(res.error || 'Erreur upload');
      }
      setUploading(false);
    });
  }, [overridePath, uploadImage, setField]);

  if (!isEdit || !path) {
    return <img src={finalSrc} alt={alt} className={className} {...rest} />;
  }

  return (
    <label className={`ed-img ${className}`} title="Cliquer pour remplacer l'image">
      <img src={finalSrc} alt={alt} className={className} {...rest} />
      <span className="ed-img-overlay">
        {uploading ? 'Upload…' : (err ? err : 'Remplacer')}
      </span>
      <input
        type="file"
        accept="image/*"
        onChange={onPick}
        style={{ display: 'none' }}
      />
    </label>
  );
}
