/* Up Technologies — fallback statique pour le rendu initial.
 *
 * Le contenu de ce site est piloté par SiteEntreprise/content.json (source de
 * vérité, modifiable en mode admin). On l'importe ici pour le baker dans le
 * bundle : avant que le fetch /api/content ait répondu, le site rend déjà
 * avec les valeurs par défaut. Une fois la réponse reçue, le React Context
 * remplace les valeurs si elles ont changé côté serveur.
 */
import content from '../content.json';

export const UP_DATA = content;
