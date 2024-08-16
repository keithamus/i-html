// A small polyfill for CSSStateSet
class StateSet extends Set {
  #el = null
  #existing = null
  constructor(el, existing) {
    super()
    this.#el = el
    this.#existing = existing
  }
  add(state) {
    super.add(state)
    const existing = this.#existing
    if (existing) {
      try {
        existing.add(state)
      } catch {
        existing.add(`--${state}`)
      }
    } else {
      this.#el.setAttribute(`state-${state}`, '')
    }
  }
  delete(state) {
    super.delete(state)
    const existing = this.#existing
    if (existing) {
      existing.delete(state)
      existing.delete(`--${state}`)
    } else {
      this.#el.removeAttribute(`state-${state}`)
    }
  }
  has(state) {
    return super.has(state)
  }
  clear() {
    for(const state of this) this.delete(state)
  }
}

const queueATask = () => new Promise(resolve => setTimeout(resolve, 0))

const styles = new CSSStyleSheet()
styles.replace(`
  :host {
    display: contents;
  }
`)

export class RequestEvent extends Event {
  request = null
  constructor(request) {
    super('loadstart', {});
    this.request = request
  }
}

export class InsertEvent extends Event {
  content = null
  constructor(name, content, init) {
    super(name, init);
    this.content = content
  }
}

function handleLinkTargets(event) {
  const el = event.type === 'click' ? event.target.closest('a[target]') : event.target
  const base = event.target.ownerDocument.head.querySelector('base[target]')
  const target = el && el.target ? document.getElementById(el.target) : base && base.target ? document.getElementById(base.target) : null
  if (!target || !(target instanceof IHTMLElement)) return
  if (event.type === 'submit' && el.tagName === 'FORM') {
    target.src = event.submitter.getAttribute('formaction') || el.action
    event.preventDefault()
  } else if (event.type === 'click' && el.tagName === 'A') {
    target.src = el.href
    event.preventDefault()
  }
}

const htmlMime = /^text\/([^+]+\+)?html\s*(?:;.*)?$/
const svgMime = /^image\/(svg\+)xml\s*(?:;.*)?$/
const xmlMime = /^application\/([^+]+\+)?xml\s*(?:;.*)?$/
const eventStreamMime = /^text\/([^+]+\+)?event-stream\s*(?:;.*)?$/
const wildcardMime = /^\*\/(?:[^+]+\+)?\*\s*(?:;.*)?$/

export class IHTMLElement extends HTMLElement {
  static observedAttributes = ['src', 'accept', 'loading']

  get src() {
    return new URL(this.getAttribute('src') || '', window.location.href).toString()
  }

  set src(val) {
    this.setAttribute('src', val)
  }

  get #defaultTarget() {
    if (svgMime.test(this.accept)) return 'svg'
    return 'body > *'
  }

  get target() {
    const target = this.getAttribute('target') || this.#defaultTarget
    try {
      this.matches(target)
      return target
    } catch {
      return this.#defaultTarget
    }
  }

  set target(value) {
    this.setAttribute('target', value)
  }

  get insert() {
    const insert = this.getAttribute('insert')
    if (insert === 'append') return 'append'
    if (insert === 'prepend') return 'prepend'
    return 'replace'
  }

  set insert(value) {
    this.setAttribute('insert', value)
  }

  get loading() {
    if (this.getAttribute('loading') === 'lazy') return 'lazy'
    if (this.getAttribute('loading') === 'none') return 'none'
    return 'eager'
  }

  set loading(value) {
    this.setAttribute('loading', value)
  }

  get accept() {
    const accept = this.getAttribute('accept') || ''
    if (htmlMime.test(accept)) return accept
    if (svgMime.test(accept)) return accept
    if (xmlMime.test(accept)) return accept
    if (wildcardMime.test(accept)) return accept
    return 'text/html'
  }

  set accept(val) {
    this.setAttribute('accept', val)
  }

  #internals = this.attachInternals()
  #fetchController = new AbortController()
  #observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const {target} = entry
          this.#observer.unobserve(target)
          if (!this.shadowRoot.contains(target)) return
          if (this.loading === 'lazy') {
            this.#load()
          }
        }
      }
    },
    {
      // Currently the threshold is set to 256px from the bottom of the viewport
      // with a threshold of 0.1. This means the element will not load until about
      // 2 keyboard-down-arrow presses away from being visible in the viewport,
      // giving us some time to fetch it before the contents are made visible
      rootMargin: '0px 0px 256px 0px',
      threshold: 0.01,
    },
  )

  constructor() {
    super()
    Object.defineProperty(this.#internals, 'states', {value: new StateSet(this, this.#internals.states)})
    if (!this.shadowRoot) {
      this.attachShadow({mode: 'open'})
      this.shadowRoot.adoptedStyleSheets.push(styles)
      this.shadowRoot.append(document.createElement('slot'))
      this.shadowRoot.append(document.createElement('span'))
    }
    this.#internals.states.add('waiting')
    this.#internals.role = 'presentation'
  }

  attributeChangedCallback(name, old, value) {
    if (name === 'src' || name === 'accept') {
      if (this.isConnected && this.loading === 'eager') {
        this.#load()
      } else if (this.loading !== 'eager') {
        this.#fetchController?.abort()
      }
    } else if (name === 'loading') {
      if (this.isConnected && old !== 'eager' && value === 'eager') {
        this.#load()
      } else if (this.isConnected && value === 'lazy') {
        this.#observe()
      }
    }
  }

  connectedCallback() {
    if (this.src && this.loading === 'eager') {
      this.#load()
    }
    this.#observe()
    this.ownerDocument.addEventListener('click', handleLinkTargets, true)
    this.ownerDocument.addEventListener('submit', handleLinkTargets, true)
  }

  disconnectedCallback() {
    this.#fetchController?.abort('disconnected')
  }

  #observe() {
    this.#observer.observe(this.shadowRoot.querySelector('span'))
  }

  async #load() {
    if (!this.hasAttribute('src')) return
    if (!this.#fetchController?.signal.aborted && this.#fetchController?.src == this.src) return
    this.#fetchController.abort()
    this.#fetchController = new AbortController();
    this.#fetchController.src = this.src
    this.#internals.states.delete('error')
    this.#internals.states.delete('waiting')
    this.#internals.states.add('loading')
    // We mimic the same event order as <img>, including the spec
    // which states events must be dispatched after "queue a task".
    // https://www.w3.org/TR/html52/semantics-embedded-content.html#the-img-element
    await queueATask()
    let error = false
    try {
      const request = new RequestEvent(new Request(this.src, {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          Accept: this.accept,
        },
      }))
      if (eventStreamMime.test(this.accept)) {
        await this.#stream(request.request)
      } else {
        await this.#loadOnce(request.request)
      }
    } catch (e) {
      error = e
    } finally {
      this.#fetchController.abort()
      // We mimic the same event order as <img>, including the spec
      // which states events must be dispatched after "queue a task".
      // https://www.w3.org/TR/html52/semantics-embedded-content.html#the-img-element
      await queueATask()
      this.#internals.states.delete('loading')
      this.#internals.states.delete('streaming')
      this.#internals.states.add(error ? 'error' : 'loaded')
      this.dispatchEvent(new Event(error ? 'error' : 'load'))
      this.dispatchEvent(new Event('loadend'))
      if (error) throw error
    }
  }

  async #stream(request) {
    const source = new EventSource(request.src)
    this.#fetchController.signal.addEventListener('abort', () => {
      source.close()
    })
    let open = false
    source.addEventListener('message', e => {
      if (!open) return
      this.#parseAndInject(message.data, 'text/html')
    })
    await new Promise((resolve, reject) => {
      source.addEventListener('open', resolve, {once: true})
      source.addEventListener('error', reject, {once: true})
    })
    open = true
    this.dispatchEvent(new Event('open'))
    this.#internals.states.delete('loading')
    this.#internals.states.add('streaming')
    await new Promise((resolve, reject) => {
      source.addEventListener('close', resolve, {once: true})
      source.addEventListener('error', reject, {once: true})
    })
  }

  async #loadOnce(request) {
    const signal = this.#fetchController.signal
    let response;
    try {
      response = await fetch(request, {signal})
    } catch (e) {
      if (e.code == DOMException.ABORT_ERR) return
      throw e
    }
    if (!response) {
      throw new Error(`Failed to load response`)
    }
    const ct = response.headers.get('Content-Type') || ''
    const accept = this.accept
    if (!wildcardMime.test(accept)) {
      let ctParts = (ct.match(htmlMime) || ct.match(xmlMime) || ct.match(svgMime) || [])[1]
      let acceptParts = (accept.match(htmlMime) || accept.match(xmlMime) || accept.match(svgMime) || [])[1]
      if (ctParts && ctParts !== acceptParts) {
        throw new Error(`Failed to load resource: expected ${accept} but was ${ct}`)
      }
    }
    let resolvedCt = htmlMime.test(ct) ? 'text/html' : xmlMime.test(ct) ? 'application/xml' : svgMime.test(ct) ? 'image/svg+xml' : null
    if (!resolvedCt) {
      throw new Error(`Failed to load resource: expected mime to be like 'text/html', 'application/xml' or 'image/svg+xml', but got ${ct || '(empty string)'}`)
    }
    this.#parseAndInject(await response.text(), resolvedCt)
  }

  #parseAndInject(responseText, mime) {
    const doc = new DOMParser().parseFromString(responseText, mime)
    const children = doc.querySelectorAll(this.target)
    const beforeInsert = new InsertEvent('beforeinsert', children, { cancelable: true })
    const shouldContinue = this.dispatchEvent(beforeInsert) && children.length
    if (!shouldContinue) {
      return
    }
    const activeElement = this.ownerDocument.activeElement;
    activeElement.blur()
    if (this.insert === 'append') {
      this.append(...beforeInsert.content)
    } else if (this.insert === 'prepend') {
      this.prepend(...beforeInsert.content)
    } else {
      this.replaceChildren(...beforeInsert.content)
    }
    activeElement.focus()
    this.dispatchEvent(new InsertEvent('inserted', this.childNodes))
  }
}

customElements.define('i-html', IHTMLElement)
