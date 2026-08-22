import { LitElement, html, css, svg } from 'lit'

/**
 * <folder-card> — a single folder/file tile in the folder pane.
 *
 * Visual spec ported 1:1 from the Solid OS Figma redesign
 * (file eIjn2itV9Ma1nwxyW4Nk4f, node 1569:12231). The card is a fixed
 * 192 × 145.824 px tile: folder glyph in a slate box, a ⋮ overflow menu,
 * the resource name, a divider, and a footer with the child count plus
 * optional "favorite" / "public" status badges.
 *
 * Regular (non-power, non-developer) users see only the cleaned-up name —
 * no file extension, no MIME type, no URI — so `name` is expected to be
 * pre-cleaned by the caller.
 */
export class FolderCard extends LitElement {
  static properties = {
    name: { type: String, reflect: true },
    href: { type: String, reflect: true },
    kind: { type: String, reflect: true },
    count: { type: Number, reflect: true },
    favorite: { type: Boolean, reflect: true },
    isPublic: { type: Boolean, attribute: 'is-public', reflect: true }
  }

  declare name: string
  declare href: string
  /** 'folder' (default) or 'file' — selects the card glyph. */
  declare kind: 'folder' | 'file'
  declare count: number
  declare favorite: boolean
  declare isPublic: boolean

  constructor () {
    super()
    this.name = ''
    this.href = ''
    this.kind = 'folder'
    this.count = 0
    this.favorite = false
    this.isPublic = false
  }

  static styles = css`
    :host {
      display: block;
      width: 192px;
      height: 145.824px;
      flex: 0 0 auto;
    }

    .card {
      position: relative;
      box-sizing: border-box;
      width: 192px;
      height: 145.824px;
      background: var(--white, #ffffff);
      border: 0.932px solid var(--gray-200, #e5e7eb);
      border-radius: 4.66px;
      overflow: hidden;
      text-decoration: none;
      color: inherit;
      display: block;
      cursor: pointer;
    }

    .icon-box {
      position: absolute;
      left: 13.05px;
      top: 13.31px;
      width: 37.282px;
      height: 37.282px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 9.32px;
      border-radius: 3.883px;
      background: var(--slate-100, #f1f5f9);
    }

    .icon-box svg {
      width: 18.641px;
      height: 18.641px;
      display: block;
    }

    .menu {
      position: absolute;
      right: 13.71px;
      top: 13.07px;
      width: 15.36px;
      height: 15.36px;
      padding: 0;
      margin: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .menu svg {
      width: 2.4px;
      height: 11.04px;
      display: block;
    }

    .name {
      position: absolute;
      left: 13.47px;
      top: 61.77px;
      margin: 0;
      font-family: 'Neue Einstellung', var(--font-family-base, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif);
      font-weight: 500;
      font-size: 16px;
      line-height: normal;
      color: var(--gray-700, #364153);
      white-space: nowrap;
      max-width: 165px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .divider {
      position: absolute;
      left: 13.47px;
      top: 107.61px;
      width: 163.2px;
      height: 0;
      border-top: 0.96px solid var(--gray-200, #e5e7eb);
    }

    .footer {
      position: absolute;
      left: 13.47px;
      top: 116.76px;
      width: 162.687px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .count {
      margin: 0;
      font-family: 'Neue Einstellung', var(--font-family-base, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif);
      font-weight: 500;
      font-size: 12px;
      line-height: normal;
      color: var(--gray-500, #6a7282);
      white-space: nowrap;
    }

    .badges {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 9.32px;
    }

    .badges svg {
      width: 14.913px;
      height: 14.913px;
      display: block;
    }
  `

  private folderIcon () {
    return svg`<svg viewBox="0 0 18.6408 18.6408" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15.5345 15.534C15.9465 15.534 16.3416 15.3703 16.6329 15.079C16.9242 14.7877 17.0879 14.3925 17.0879 13.9806V6.21357C17.0879 5.80158 16.9242 5.40647 16.6329 5.11515C16.3416 4.82383 15.9465 4.66017 15.5345 4.66017H9.39855C9.13876 4.66272 8.88247 4.60006 8.65315 4.47794C8.42384 4.35582 8.22881 4.17813 8.08593 3.96114L7.4568 3.0291C7.31536 2.81432 7.1228 2.63802 6.89641 2.51601C6.67003 2.39401 6.41689 2.33012 6.15972 2.33007H3.10729C2.6953 2.33007 2.30019 2.49374 2.00887 2.78505C1.71755 3.07637 1.55389 3.47149 1.55389 3.88347V13.9806C1.55389 14.3925 1.71755 14.7877 2.00887 15.079C2.30019 15.3703 2.6953 15.534 3.10729 15.534H15.5345Z" fill="#E0E7FF" fill-opacity="0.5" stroke="#6A7282" stroke-width="1.5534" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  }

  // File glyph for non-container resources. The Figma frame only shows
  // folder cards, so this reuses the folder icon's visual treatment
  // (pale indigo fill, #6A7282 stroke) on a document outline.
  private fileIcon () {
    return svg`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.5 2.5H6.5C5.94772 2.5 5.5 2.94772 5.5 3.5V20.5C5.5 21.0523 5.94772 21.5 6.5 21.5H17.5C18.0523 21.5 18.5 21.0523 18.5 20.5V6.5L14.5 2.5Z" fill="#E0E7FF" fill-opacity="0.5" stroke="#6A7282" stroke-width="1.5534" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14.5 2.5V6.5H18.5" stroke="#6A7282" stroke-width="1.5534" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  }

  private menuIcon () {
    return svg`<svg viewBox="0 0 2.4 11.04" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 5.52001C0 6.18161 0.5384 6.72001 1.2 6.72001C1.8616 6.72001 2.4 6.18161 2.4 5.52001C2.4 4.85841 1.8616 4.32001 1.2 4.32001C0.5384 4.32001 0 4.85841 0 5.52001Z" fill="#6A7282"/>
      <path d="M0 9.84001C0 10.5016 0.5384 11.04 1.2 11.04C1.8616 11.04 2.4 10.5016 2.4 9.84001C2.4 9.17841 1.8616 8.64001 1.2 8.64001C0.5384 8.64001 0 9.17841 0 9.84001Z" fill="#6A7282"/>
      <path d="M0 1.2C0 1.8616 0.5384 2.4 1.2 2.4C1.8616 2.4 2.4 1.8616 2.4 1.2C2.4 0.5384 1.8616 0 1.2 0C0.5384 0 0 0.5384 0 1.2Z" fill="#6A7282"/>
    </svg>`
  }

  private favoriteIcon () {
    return svg`<svg viewBox="0 0 14.9126 14.9126" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.16141 1.42597C7.18864 1.37095 7.23071 1.32464 7.28286 1.29226C7.33501 1.25989 7.39517 1.24273 7.45656 1.24273C7.51794 1.24273 7.5781 1.25989 7.63026 1.29226C7.68241 1.32464 7.72447 1.37095 7.7517 1.42597L9.18704 4.3333C9.2816 4.52466 9.42118 4.69022 9.5938 4.81576C9.76642 4.9413 9.96693 5.02308 10.1781 5.05408L13.3881 5.52383C13.4489 5.53264 13.506 5.5583 13.553 5.59789C13.6 5.63749 13.635 5.68945 13.654 5.7479C13.673 5.80634 13.6753 5.86894 13.6606 5.92861C13.6459 5.98827 13.6147 6.04263 13.5707 6.08554L11.2493 8.34604C11.0962 8.49523 10.9817 8.67939 10.9156 8.88267C10.8494 9.08594 10.8337 9.30225 10.8697 9.51296L11.4177 12.7067C11.4285 12.7675 11.4219 12.8301 11.3988 12.8874C11.3756 12.9446 11.3369 12.9942 11.287 13.0305C11.237 13.0667 11.1779 13.0883 11.1163 13.0925C11.0547 13.0968 10.9931 13.0837 10.9387 13.0547L8.06922 11.546C7.88015 11.4468 7.66979 11.3949 7.45625 11.3949C7.2427 11.3949 7.03234 11.4468 6.84327 11.546L3.97446 13.0547C3.91999 13.0835 3.85851 13.0965 3.79703 13.0921C3.73555 13.0878 3.67653 13.0662 3.62668 13.03C3.57683 12.9937 3.53816 12.9442 3.51506 12.8871C3.49196 12.8299 3.48536 12.7675 3.49601 12.7067L4.04343 9.51358C4.07959 9.30277 4.06393 9.08633 3.99778 8.88293C3.93164 8.67952 3.81701 8.49527 3.66378 8.34604L1.34238 6.08616C1.29801 6.04331 1.26657 5.98885 1.25164 5.929C1.23671 5.86915 1.23889 5.80631 1.25793 5.74764C1.27697 5.68896 1.3121 5.63682 1.35933 5.59714C1.40656 5.55746 1.46398 5.53184 1.52506 5.52321L4.73438 5.05408C4.9458 5.02332 5.14658 4.94165 5.31944 4.81609C5.4923 4.69053 5.63206 4.52485 5.72669 4.3333L7.16141 1.42597Z" fill="#FDC700" stroke="#FDC700" stroke-width="1.24272" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  }

  private publicIcon () {
    return svg`<svg viewBox="0 0 14.9126 14.9126" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.45596 13.6699C10.8876 13.6699 13.6696 10.8879 13.6696 7.45627C13.6696 4.02459 10.8876 1.24267 7.45596 1.24267C4.02429 1.24267 1.24237 4.02459 1.24237 7.45627C1.24237 10.8879 4.02429 13.6699 7.45596 13.6699Z" stroke="#51A2FF" stroke-width="1.24272" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7.45596 1.24267C5.86046 2.91795 4.97052 5.14278 4.97052 7.45627C4.97052 9.76975 5.86046 11.9946 7.45596 13.6699C9.05146 11.9946 9.9414 9.76975 9.9414 7.45627C9.9414 5.14278 9.05146 2.91795 7.45596 1.24267Z" stroke="#51A2FF" stroke-width="1.24272" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M1.24237 7.45628H13.6696" stroke="#51A2FF" stroke-width="1.24272" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  }

  private onMenuClick (e: Event) {
    e.preventDefault()
    e.stopPropagation()
    this.dispatchEvent(new CustomEvent('folder-card-menu', {
      bubbles: true,
      composed: true,
      detail: { name: this.name, href: this.href }
    }))
  }

  render () {
    return html`
      <a class="card" href=${this.href || '#'} part="card">
        <span class="icon-box">${this.kind === 'file' ? this.fileIcon() : this.folderIcon()}</span>
        <button
          class="menu"
          type="button"
          aria-label=${`Actions for ${this.name}`}
          @click=${this.onMenuClick}
        >${this.menuIcon()}</button>
        <p class="name" title=${this.name}>${this.name}</p>
        <div class="divider"></div>
        <div class="footer">
          <p class="count">
            ${this.kind === 'file' ? '' : html`${this.count} item${this.count === 1 ? '' : 's'}`}
          </p>
          <div class="badges">
            ${this.favorite ? this.favoriteIcon() : null}
            ${this.isPublic ? this.publicIcon() : null}
          </div>
        </div>
      </a>
    `
  }
}

export const FOLDER_CARD_TAG = 'folder-card'

if (!customElements.get(FOLDER_CARD_TAG)) {
  customElements.define(FOLDER_CARD_TAG, FolderCard)
}
