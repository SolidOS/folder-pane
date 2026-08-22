import { LitElement, html, css, svg, nothing } from 'lit'

/**
 * A single navigable node in the folder tree.
 */
export interface NavNode {
  name: string
  href: string
  expanded?: boolean
  current?: boolean
  children?: NavNode[]
}

/**
 * <folder-nav-sidebar> — the left navigation rail of the Solid OS folder
 * redesign (Figma file eIjn2itV9Ma1nwxyW4Nk4f, node 1569:12232).
 *
 * Fixed 250px rail: a "Favorites" section, a divider, the main folder tree
 * ("Home"), a divider, and a "Public" section. Tree rows carry a disclosure
 * chevron, a bullet/glyph, and a label. The visual spec — paddings, the
 * #e4dbfe current-row highlight, the #e5e7eb guide lines on nested groups —
 * is ported 1:1 from the design.
 */
export class FolderNavSidebar extends LitElement {
  static properties = {
    homeLabel: { type: String, attribute: 'home-label' },
    homeHref: { type: String, attribute: 'home-href' },
    publicHref: { type: String, attribute: 'public-href' }
  }

  declare homeLabel: string
  declare homeHref: string
  declare publicHref: string
  /** Tree under "Home". Set as a property (not an attribute). */
  tree: NavNode[] = []
  /** Favorited resources shown under the "Favorites" section. */
  favorites: NavNode[] = []
  /**
   * Per-row expand/collapse overrides, keyed by href. Survives parent-driven
   * `tree` reassignments (it's component state, not tree data), so a user's
   * disclosure clicks aren't wiped when folderPane re-syncs the tree.
   */
  private _expanded = new Map<string, boolean>()
  /** Disclosure state for the top-level "Home" and "Favorites" sections. */
  private _homeExpanded = true
  private _favExpanded = false

  constructor () {
    super()
    this.homeLabel = 'Home'
    this.homeHref = ''
    this.publicHref = ''
  }

  static styles = css`
    :host {
      display: block;
      width: 250px;
      min-width: 250px;
      align-self: stretch;
      box-sizing: border-box;
      background: var(--neutral-50, #fafafa);
      border-right: 1px solid var(--gray-200, #e5e7eb);
      border-top-left-radius: 5px;
      border-bottom-left-radius: 5px;
      font-family: 'Neue Einstellung', var(--font-family-base, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif);
    }

    .inner {
      box-sizing: border-box;
      padding: 17px 10px 17px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .divider {
      height: 0;
      border-top: 1px solid var(--gray-200, #e5e7eb);
      width: 100%;
    }

    /* A top-level section row (Favorites / Home / Public). The disclosure
       chevron is a sibling button — only the .row-link navigates. */
    .row {
      display: flex;
      align-items: center;
      gap: 5px;
      box-sizing: border-box;
      width: 100%;
      padding: 5px 15px 5px 5px;
      border-radius: 5px;
    }

    .row--current {
      background: #e4dbfe;
    }

    /* The navigating part of a row — chevron clicks never reach this. */
    .row-link,
    .tree-row-link {
      display: flex;
      align-items: center;
      flex: 1 1 auto;
      min-width: 0;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }

    .chev {
      flex: 0 0 16px;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
    }

    .chev svg {
      width: 9px;
      height: 5px;
      display: block;
      transform: rotate(-90deg);
      transition: transform 0.12s ease;
    }

    .chev[aria-expanded='true'] svg {
      transform: rotate(0deg);
    }

    .label-group {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .glyph {
      flex: 0 0 16px;
      width: 16px;
      height: 16px;
      display: block;
    }

    .bullet {
      flex: 0 0 6px;
      width: 6px;
      height: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Inline SVGs default to vertical-align: baseline, which leaves a
       descender slot under them and visually shifts the glyph up against
       neighbouring text. Force every nav svg to block so the icon box
       contains the glyph exactly. */
    .chev svg,
    .glyph svg,
    .bullet svg {
      display: block;
    }

    .glyph svg { width: 16px; height: 16px; }
    .bullet svg { width: 6px; height: 6px; }

    .label {
      font-size: 14px;
      /* line-height: 1 keeps the line box snug to the glyphs so flex
         align-items: center actually centers against the visual text,
         not against the (taller) default line box. */
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .label--section {
      font-weight: 500;
      color: var(--gray-500, #6a7282);
    }

    .label--home {
      font-weight: 500;
      color: var(--primary-royal-lavender, #7c4dff);
    }

    .label--item {
      font-weight: 400;
      color: var(--gray-500, #6a7282);
    }

    /* The "Home" tree and its nested groups. */
    .tree {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
    }

    .tree-children {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      box-sizing: border-box;
      padding-left: 10px;
    }

    .tree-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      box-sizing: border-box;
      border-left: 1px solid var(--gray-200, #e5e7eb);
    }

    /* A folder row in the tree. The chevron toggles in place; the .tree-row-link
       beside it is the only navigating element. */
    .tree-row {
      display: flex;
      align-items: center;
      gap: 5px;
      box-sizing: border-box;
      width: 100%;
      padding: 5px 15px 5px 10px;
      border-radius: 5px;
    }

    .tree-row .label-group {
      width: 125px;
    }
  `

  private chevronIcon () {
    return svg`<svg viewBox="0 0 9 5" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8.14645 0.146447C8.34171 -0.0488144 8.65821 -0.048812 8.85348 0.146447C9.04874 0.341709 9.04874 0.658216 8.85348 0.853478L4.85348 4.85348C4.65822 5.04874 4.34171 5.04874 4.14645 4.85348L0.146447 0.853478C-0.0488155 0.658216 -0.0488155 0.341709 0.146447 0.146447C0.341709 -0.0488155 0.658216 -0.0488155 0.853478 0.146447L4.49996 3.79293L8.14645 0.146447Z" fill="#D1D5DC"/>
    </svg>`
  }

  private starIcon () {
    return svg`<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.6828 1.52993C7.71201 1.4709 7.75714 1.42122 7.8131 1.38648C7.86905 1.35174 7.9336 1.33333 7.99946 1.33333C8.06532 1.33333 8.12987 1.35174 8.18583 1.38648C8.24178 1.42122 8.28692 1.4709 8.31613 1.52993L9.85613 4.64926C9.95758 4.85457 10.1073 5.0322 10.2925 5.1669C10.4778 5.3016 10.6929 5.38934 10.9195 5.4226L14.3635 5.9266C14.4287 5.93605 14.49 5.96358 14.5405 6.00606C14.5909 6.04855 14.6284 6.10429 14.6488 6.167C14.6692 6.22971 14.6716 6.29687 14.6559 6.36089C14.6401 6.42491 14.6067 6.48323 14.5595 6.52926L12.0688 8.9546C11.9045 9.11466 11.7816 9.31225 11.7107 9.53035C11.6397 9.74845 11.6228 9.98052 11.6615 10.2066L12.2495 13.6333C12.261 13.6985 12.2539 13.7656 12.2291 13.8271C12.2043 13.8885 12.1628 13.9417 12.1092 13.9806C12.0556 14.0195 11.9921 14.0426 11.926 14.0472C11.86 14.0518 11.7939 14.0377 11.7355 14.0066L8.6568 12.3879C8.45394 12.2814 8.22825 12.2258 7.99913 12.2258C7.77001 12.2258 7.54432 12.2814 7.34146 12.3879L4.26346 14.0066C4.20502 14.0375 4.13906 14.0515 4.0731 14.0468C4.00713 14.0421 3.94381 14.019 3.89033 13.9801C3.83684 13.9412 3.79535 13.8881 3.77057 13.8267C3.74578 13.7654 3.7387 13.6984 3.75013 13.6333L4.33746 10.2073C4.37626 9.98108 4.35945 9.74886 4.28849 9.53063C4.21753 9.31239 4.09454 9.1147 3.93013 8.9546L1.43946 6.52993C1.39186 6.48395 1.35813 6.42553 1.34211 6.36131C1.32608 6.2971 1.32842 6.22967 1.34885 6.16672C1.36928 6.10377 1.40698 6.04782 1.45765 6.00525C1.50832 5.96268 1.56993 5.93519 1.63546 5.92593L5.0788 5.4226C5.30563 5.3896 5.52106 5.30197 5.70652 5.16725C5.89198 5.03254 6.04193 4.85478 6.14346 4.64926L7.6828 1.52993Z" stroke="#99A1AF" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  }

  private homeIcon () {
    return svg`<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.3333 13.3333C13.687 13.3333 14.0261 13.1929 14.2761 12.9428C14.5262 12.6928 14.6667 12.3536 14.6667 12V5.33333C14.6667 4.97971 14.5262 4.64057 14.2761 4.39052C14.0261 4.14048 13.687 4 13.3333 4H8.06667C7.84368 4.00219 7.6237 3.94841 7.42687 3.84359C7.23004 3.73877 7.06264 3.58625 6.94 3.4L6.4 2.6C6.27859 2.41565 6.11332 2.26432 5.919 2.1596C5.72468 2.05488 5.50741 2.00004 5.28667 2H2.66667C2.31304 2 1.97391 2.14048 1.72386 2.39052C1.47381 2.64057 1.33333 2.97971 1.33333 3.33333V12C1.33333 12.3536 1.47381 12.6928 1.72386 12.9428C1.97391 13.1929 2.31304 13.3333 2.66667 13.3333H13.3333Z" stroke="#7C4DFF" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  }

  private globeIcon () {
    return svg`<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8.00026 14.6667C11.6822 14.6667 14.6669 11.6819 14.6669 8.00002C14.6669 4.31812 11.6822 1.33335 8.00026 1.33335C4.31836 1.33335 1.33359 4.31812 1.33359 8.00002C1.33359 11.6819 4.31836 14.6667 8.00026 14.6667Z" stroke="#99A1AF" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8.00026 1.33335C6.28842 3.13079 5.33359 5.51784 5.33359 8.00002C5.33359 10.4822 6.28842 12.8692 8.00026 14.6667C9.7121 12.8692 10.6669 10.4822 10.6669 8.00002C10.6669 5.51784 9.7121 3.13079 8.00026 1.33335Z" stroke="#99A1AF" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M1.33359 8H14.6669" stroke="#99A1AF" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  }

  private bulletIcon () {
    // viewBox padded by 0.5 on every side so the 1px stroke (outer edge at
    // ±3 from centre) never touches the svg's clip rect — otherwise the
    // bottom/right of the circle gets shaved and the glyph looks off-centre.
    return svg`<svg viewBox="-0.5 -0.5 7 7" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="3" cy="3" r="2.5" stroke="#6A7282" stroke-width="1"/>
    </svg>`
  }

  /** Effective expand state for a node — user override wins over the default. */
  private isExpanded (node: NavNode): boolean {
    return this._expanded.has(node.href)
      ? !!this._expanded.get(node.href)
      : !!node.expanded
  }

  /**
   * Disclosure-chevron click. Toggles the row in place — it must NOT navigate
   * (the chevron lives next to, not inside, the row's link). Also emits
   * `folder-nav-toggle` so the host can lazily load children if needed.
   */
  private toggleNode (node: NavNode, e: Event) {
    e.preventDefault()
    e.stopPropagation()
    const next = !this.isExpanded(node)
    this._expanded.set(node.href, next)
    this.requestUpdate()
    this.dispatchEvent(new CustomEvent('folder-nav-toggle', {
      bubbles: true,
      composed: true,
      detail: { href: node.href, expanded: next }
    }))
  }

  private renderNode (node: NavNode): unknown {
    const hasChildren = !!(node.children && node.children.length)
    const expanded = this.isExpanded(node)
    return html`
      <div class=${`tree-row${node.current ? ' row--current' : ''}`}>
        <button
          class="chev"
          type="button"
          aria-expanded=${expanded ? 'true' : 'false'}
          aria-label=${expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          @click=${(e: Event) => this.toggleNode(node, e)}
        >${this.chevronIcon()}</button>
        <a class="tree-row-link" href=${node.href || '#'} title=${node.name}>
          <span class="label-group">
            <span class="bullet">${this.bulletIcon()}</span>
            <span class="label label--item">${node.name}</span>
          </span>
        </a>
      </div>
      ${hasChildren && expanded
        ? html`<div class="tree-children"><div class="tree-group">
            ${node.children!.map(child => this.renderNode(child))}
          </div></div>`
        : nothing}
    `
  }

  /** Toggle a top-level section's disclosure without navigating. */
  private toggleSection (which: 'home' | 'fav', e: Event) {
    e.preventDefault()
    e.stopPropagation()
    if (which === 'home') this._homeExpanded = !this._homeExpanded
    else this._favExpanded = !this._favExpanded
    this.requestUpdate()
  }

  render () {
    return html`
      <div class="inner">
        <!-- Favorites -->
        <div class="row">
          <button
            class="chev"
            type="button"
            aria-expanded=${this._favExpanded ? 'true' : 'false'}
            aria-label=${this._favExpanded ? 'Collapse Favorites' : 'Expand Favorites'}
            @click=${(e: Event) => this.toggleSection('fav', e)}
          >${this.chevronIcon()}</button>
          <a class="row-link" href="#favorites">
            <span class="label-group">
              <span class="glyph">${this.starIcon()}</span>
              <span class="label label--section">Favorites</span>
            </span>
          </a>
        </div>
        ${this._favExpanded && this.favorites.length
          ? html`<div class="tree-children"><div class="tree-group">
              ${this.favorites.map(fav => html`
                <div class="tree-row">
                  <span class="chev"></span>
                  <a class="tree-row-link" href=${fav.href || '#'} title=${fav.name}>
                    <span class="label-group">
                      <span class="bullet">${this.bulletIcon()}</span>
                      <span class="label label--item">${fav.name}</span>
                    </span>
                  </a>
                </div>
              `)}
            </div></div>`
          : nothing}

        <div class="divider"></div>

        <!-- Home tree -->
        <div class="tree">
          <div class="row row--current">
            <button
              class="chev"
              type="button"
              aria-expanded=${this._homeExpanded ? 'true' : 'false'}
              aria-label=${this._homeExpanded ? 'Collapse Home' : 'Expand Home'}
              @click=${(e: Event) => this.toggleSection('home', e)}
            >${this.chevronIcon()}</button>
            <a class="row-link" href=${this.homeHref || '#'}>
              <span class="label-group">
                <span class="glyph">${this.homeIcon()}</span>
                <span class="label label--home">${this.homeLabel}</span>
              </span>
            </a>
          </div>
          ${this._homeExpanded && this.tree.length
            ? html`<div class="tree-children"><div class="tree-group">
                ${this.tree.map(node => this.renderNode(node))}
              </div></div>`
            : nothing}
        </div>

        <div class="divider"></div>

        <!-- Public -->
        <div class="row">
          <button
            class="chev"
            type="button"
            aria-label="Public"
            @click=${(e: Event) => { e.preventDefault(); e.stopPropagation() }}
          >${this.chevronIcon()}</button>
          <a class="row-link" href=${this.publicHref || '#'}>
            <span class="label-group">
              <span class="glyph">${this.globeIcon()}</span>
              <span class="label label--section">Public</span>
            </span>
          </a>
        </div>
      </div>
    `
  }
}

export const FOLDER_NAV_SIDEBAR_TAG = 'folder-nav-sidebar'

if (!customElements.get(FOLDER_NAV_SIDEBAR_TAG)) {
  customElements.define(FOLDER_NAV_SIDEBAR_TAG, FolderNavSidebar)
}
