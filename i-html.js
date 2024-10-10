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
    super('loadstart', {})
    this.request = request
  }
}

export class InsertEvent extends Event {
  content = null
  constructor(name, content, init) {
    super(name, init)
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

const textMime = /^text\/([^+]+\+)?plain\s*(?:;.*)?$/
const htmlMime = /^text\/([^+]+\+)?html\s*(?:;.*)?$/
const svgMime = /^image\/(svg\+)xml\s*(?:;.*)?$/
const xmlMime = /^application\/([^+]+\+)?xml\s*(?:;.*)?$/
const eventStreamMime = /^text\/([^+]+\+)?event-stream\s*(?:;.*)?$/
const wildcardMime = /^\*\/(?:[^+]+\+)?\*\s*(?:;.*)?$/

const validAllow = new Set(['refresh', 'iframe', 'i-html', 'media', 'script', 'style', 'cross-origin'])

export class IHTMLElement extends HTMLElement {
  static observedAttributes = ['src', 'accept', 'loading', 'allow']

  get src() {
    return new URL(this.getAttribute('src') || '', window.location.href).toString()
  }

  set src(val) {
    this.setAttribute('src', val)
  }

  get credentials(){
    let credentials = this.getAttribute('credentials')
    if (credentials == 'include' || credentials == 'omit') return credentials
    return 'same-origin'
  }

  set credentials(value) {
    this.setAttribute(credentials, value)
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

  #allow = new Set()
  get allow() {
    return Array.from(this.#allow).join(' ')
  }

  set allow(value) {
    this.setAttribute('allow', value)
    if (value == '*') value = [...validAllow].join(' ')
    this.#allow = new Set(String(value).split(/ /g).filter(allow => validAllow.has(allow)))
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
    if (textMime.test(accept)) return accept
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
    } else if (name === 'allow') {
      this.#allow = new Set(String(value).split(/ /g).filter(allow => validAllow.has(allow)))
    }
  }

  connectedCallback() {
    if (this.src && this.loading === 'eager') {
      this.#load()
    }
    this.#observe()
    this.addEventListener('command', this)
    this.ownerDocument.addEventListener('click', handleLinkTargets, true)
    this.ownerDocument.addEventListener('submit', handleLinkTargets, true)
  }

  handleEvent(event) {
    if (event.type == 'command') {
      if (event.command == '--load') {
        this.#load()
      } else if (event.command == '--stop') {
        clearTimeout(this.#refreshTimer)
        this.#fetchController?.abort('stop')
      }
    }
  }

  disconnectedCallback() {
    this.#fetchController?.abort('disconnected')
  }

  #observe() {
    this.#observer.observe(this.shadowRoot.querySelector('span'))
  }

  #refreshTimer = null
  #setupRefresh(refresh) {
    if (!this.#allow.has('refresh')) return
    let [time, url] = String(refresh).split(/;\s*url=/) || []
    time = time ? Number(time) : -1
    clearTimeout(this.#refreshTimer)
    if (time > -1 && time < Number.MAX_SAFE_INTEGER) {
      this.#refreshTimer = setTimeout(() => this.#load(url), Number(time) * 1000)
    }
  }

  async #load(src) {
    if (!src && !this.hasAttribute('src')) return
    src = new URL(src || this.src, this.src || window.location.href)
    if (!this.#allow.has('cross-origin') && src.origin !== window.location.origin) {
      console.log(src, window.location.origin);
      throw new Error(`i-html failed to load cross origin resource ${src} without allow=cross-origin`)
    }
    if (!this.#fetchController?.signal.aborted && this.#fetchController?.src == src.toString()) return
    clearTimeout(this.#refreshTimer)
    this.#fetchController.abort()
    this.#fetchController = new AbortController()
    this.#fetchController.src = src.toString()
    this.#internals.states.delete('error')
    this.#internals.states.delete('waiting')
    this.#internals.states.add('loading')
    // We mimic the same event order as <img>, including the spec
    // which states events must be dispatched after "queue a task".
    // https://www.w3.org/TR/html52/semantics-embedded-content.html#the-img-element
    await queueATask()
    let error = false
    try {
      const request = new RequestEvent(new Request(src, {
        method: 'GET',
        credentials: this.credentials,
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
    let response
    try {
      response = await fetch(request, {signal})
    } catch (e) {
      if (e.code == DOMException.ABORT_ERR) return
      throw e
    }
    if (!response) {
      throw new Error(`Failed to load response`)
    }

    this.#setupRefresh(response.headers.get('Refresh') || '')
    const ct = response.headers.get('Content-Type') || ''
    const accept = this.accept
    if (!wildcardMime.test(accept)) {
      let ctParts = (ct.match(htmlMime) || ct.match(textMime) || ct.match(xmlMime) || ct.match(svgMime) || [])[1]
      let acceptParts = (accept.match(htmlMime) || accept.match(xmlMime) || accept.match(svgMime) || [])[1]
      if (ctParts && ctParts !== acceptParts) {
        throw new Error(`Failed to load resource: expected ${accept} but was ${ct}`)
      }
    }

    let resolvedCt = htmlMime.test(ct) ? 'text/html' : textMime.test(ct) ? 'text/plain' : xmlMime.test(ct) ? 'application/xml' : svgMime.test(ct) ? 'image/svg+xml' : null
    if (!resolvedCt) {
      throw new Error(`Failed to load resource: expected mime to be like 'text/html', 'application/xml' or 'image/svg+xml', but got ${ct || '(empty string)'}`)
    }
    this.#parseAndInject(await response.text(), resolvedCt)
  }

  #parseAndInject(responseText, mime) {
    let children;
    if (mime == 'text/plain') {
      const doc = new DOMParser().parseFromString('<!DOCTYPE html>', 'text/html')
      const span = document.createElement('span')
      span.textContent = responseText;
      doc.body.append(span)
      children = doc.querySelectorAll('span')
    } else {
      const doc = new DOMParser().parseFromString(responseText, mime)
      this.#setupRefresh(doc.querySelector('meta[http-equiv="refresh"]')?.content || '')
      children = this.#sanitize(doc).querySelectorAll(this.target)
    }
    const beforeInsert = new InsertEvent('beforeinsert', children, { cancelable: true })
    const shouldContinue = this.dispatchEvent(beforeInsert) && children.length
    if (!shouldContinue) {
      return
    }
    const oldActiveElement = this.ownerDocument.activeElement
    if (this.insert === 'append') {
      this.append(...beforeInsert.content)
    } else if (this.insert === 'prepend') {
      this.prepend(...beforeInsert.content)
    } else {
      this.replaceChildren(...beforeInsert.content)
    }
    const activeElement = this.ownerDocument.activeElement
    if (activeElement != oldActiveElement) {
      activeElement.focus({ preventScroll: true })
    }
    this.dispatchEvent(new InsertEvent('inserted', this.childNodes))
  }

  #sanitize(doc) {
    let removes = []
    const allows = this.#allow
    if (!this.#allow.has('iframe')) removes.push('iframe')
    if (!this.#allow.has('i-html')) removes.push('i-html')
    if (!this.#allow.has('script')) removes.push('script')
    if (!this.#allow.has('style')) removes.push('style', 'link[rel=stylesheet]')
    if (!this.#allow.has('media')) removes.push('img', 'picture', 'video', 'audio', 'object')
    if (removes.length) {
      for(const el of doc.querySelectorAll(removes.join(', '))) el.remove()
    }
    return doc
  }
}

customElements.define('i-html', IHTMLElement)
