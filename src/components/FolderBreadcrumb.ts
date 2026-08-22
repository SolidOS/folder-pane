import { LitElement, html, css, svg, nothing } from 'lit'

/**
 * A single segment of the breadcrumb trail.
 */
export interface Crumb {
  label: string
  href?: string
  /**
   * `'grid'` renders the Figma dashboard glyph (a 2×2 of rounded rectangles)
   * before the label. Used on the leading crumb to mirror the redesign.
   */
  icon?: 'grid'
}

/**
 * <folder-breadcrumb> — the location trail at the top of the folder view
 * (Figma file eIjn2itV9Ma1nwxyW4Nk4f, node 1569:12509).
 *
 * Visual spec: a flex row with `gap: 5px`, every segment is a
 * `Neue Einstellung Regular 14px #6a7282` label, segments are separated by
 * a 5.751 × 12.334 px diagonal stroke (the "/" slash). The leading segment
 * also shows the 12 px four-tile dashboard glyph.
 */
export class FolderBreadcrumb extends LitElement {
  /** Crumbs to render, left-to-right. Set as a property. */
  crumbs: Crumb[] = []

  static styles = css`
    :host {
      display: block;
      font-family: 'Neue Einstellung', var(--font-family-base, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif);
    }

    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 5px;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .crumb {
      display: flex;
      align-items: center;
      gap: 4px;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }

    .label {
      font-size: 14px;
      /* line-height: 1 keeps the visual centre aligned with the icon and
         separator — otherwise the default line box pushes text slightly low. */
      line-height: 1;
      font-weight: 400;
      color: var(--gray-500, #6a7282);
      white-space: nowrap;
    }

    .grid-icon {
      flex: 0 0 12px;
      width: 12px;
      height: 12px;
      display: block;
    }

    .grid-icon svg,
    .sep svg {
      display: block;
    }

    .sep {
      /* The Figma slash is a 13.609 px line rotated 115° inside a 5.751 ×
         12.334 hit-box. Rendering it as a properly-scaled diagonal stroke
         keeps the line endpoints flush with the box corners. */
      flex: 0 0 auto;
      width: 5.751px;
      height: 12.334px;
      display: block;
    }
  `

  private gridIconSvg () {
    return svg`<svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.5 1.5H2C1.72386 1.5 1.5 1.72386 1.5 2V5.5C1.5 5.77614 1.72386 6 2 6H4.5C4.77614 6 5 5.77614 5 5.5V2C5 1.72386 4.77614 1.5 4.5 1.5Z" stroke="#6A7282" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10.0003 1.5H7.50028C7.22414 1.5 7.00028 1.72386 7.00028 2V3.5C7.00028 3.77614 7.22414 4 7.50028 4H10.0003C10.2764 4 10.5003 3.77614 10.5003 3.5V2C10.5003 1.72386 10.2764 1.5 10.0003 1.5Z" stroke="#6A7282" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10.0003 6H7.50028C7.22414 6 7.00028 6.22386 7.00028 6.5V10C7.00028 10.2761 7.22414 10.5 7.50028 10.5H10.0003C10.2764 10.5 10.5003 10.2761 10.5003 10V6.5C10.5003 6.22386 10.2764 6 10.0003 6Z" stroke="#6A7282" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4.5 7.99998H2C1.72386 7.99998 1.5 8.22384 1.5 8.49998V9.99998C1.5 10.2761 1.72386 10.5 2 10.5H4.5C4.77614 10.5 5 10.2761 5 9.99998V8.49998C5 8.22384 4.77614 7.99998 4.5 7.99998Z" stroke="#6A7282" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  }

  /**
   * A diagonal slash from bottom-left to top-right of a 5.751 × 12.334 box,
   * matching Figma node 1569:12518 (a 13.609 px line rotated 115°).
   */
  private separatorSvg () {
    return svg`<svg viewBox="0 0 5.751 12.334" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="12.334" x2="5.751" y2="0" stroke="#6A7282" stroke-width="1"/>
    </svg>`
  }

  render () {
    if (!this.crumbs.length) return nothing
    return html`
      <ol class="breadcrumb" aria-label="Breadcrumb">
        ${this.crumbs.map((c, i) => html`
          ${i > 0 ? html`<li class="sep" aria-hidden="true">${this.separatorSvg()}</li>` : nothing}
          <li>
            <a class="crumb" href=${c.href || '#'} aria-current=${i === this.crumbs.length - 1 ? 'page' : 'false'}>
              ${c.icon === 'grid' ? html`<span class="grid-icon">${this.gridIconSvg()}</span>` : nothing}
              <span class="label">${c.label}</span>
            </a>
          </li>
        `)}
      </ol>
    `
  }
}

export const FOLDER_BREADCRUMB_TAG = 'folder-breadcrumb'

if (!customElements.get(FOLDER_BREADCRUMB_TAG)) {
  customElements.define(FOLDER_BREADCRUMB_TAG, FolderBreadcrumb)
}
