import { useEffect, useRef, useState, useCallback } from 'react';
import { useAdmin, useEditable, getByPath } from './AdminContext';

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
      if (ref.current.innerHTML !== (display || '')) ref.current.innerHTML = display || '';
    } else {
      if (ref.current.innerText !== (display || '')) ref.current.innerText = display || '';
    }
  }, [display, isEdit, html]);

  const onBlur = useCallback((e) => {
    if (!path) return;
    const next = html ? e.currentTarget.innerHTML : e.currentTarget.innerText;
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
      return <Tag className={className} dangerouslySetInnerHTML={{ __html: display }} {...rest} />;
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
        dangerouslySetInnerHTML={{ __html: display }}
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
  const finalSrc = override || src;

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
