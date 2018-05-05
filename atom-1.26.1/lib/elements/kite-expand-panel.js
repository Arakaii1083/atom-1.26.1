
const {CompositeDisposable, Disposable} = require('atom');
const {addDelegatedEventListener, DisposableEvent} = require('../utils');
const elementResizeDetector = require('element-resize-detector')({strategy: 'scroll'});

class KiteExpandPanel extends HTMLElement {
  attachedCallback() {
    this.subscriptions = new CompositeDisposable();
    this.createJumpTo();
    this.handleCollapsibles();

    this.intersectionObserver = new IntersectionObserver((entries) => {
      const {intersectionRect} = entries[entries.length - 1];
      if (intersectionRect.width > 0 || intersectionRect.height > 0) {
        this.checkScroll();
      }
    });

    this.intersectionObserver.observe(this);
    this.checkScroll();

    const measureDimensions = () => { this.checkScroll(); };
    elementResizeDetector.listenTo(this, measureDimensions);
    this.subscriptions.add(new Disposable(() => { elementResizeDetector.removeListener(this, measureDimensions); }));

    window.addEventListener('resize', measureDimensions);
    this.subscriptions.add(new Disposable(() => { window.removeEventListener('resize', measureDimensions); }));
  }

  detachedCallback() {
    this.subscriptions && this.subscriptions.dispose();
    delete this.subscriptions;
  }

  checkScroll() {
    const container = this.querySelector('.sections-wrapper');
    this.classList.toggle('has-scroll', container.scrollHeight > container.offsetHeight);
  }

  createJumpTo() {
    const examplesSection = this.querySelector('.examples-from-your-code') ||
                            this.querySelector('.examples');
    const docsSection = this.querySelector('.summary');

    const links = [];

    if (docsSection) {
      links.push(`
        <a href="#"
           data-jump=".summary">
          <span>Description</span>
        </a>`);
    }

    if (examplesSection) {
      links.push(`
        <a href="#"
           data-jump=".${examplesSection.className}">
          <span>How to</span>
        </a>`);
    }

    if (links.length > 0) {
      const actions = this.querySelector('footer .actions');
      actions.innerHTML = `<span>Jump to</span> ${links.join(' ')}`;
    }

    this.subscriptions.add(addDelegatedEventListener(this, 'click', '[data-jump]', (e) => {
      const {target} = e;

      this.jumpTo(target.getAttribute('data-jump'));
    }));
  }

  jumpTo(targetCls) {
    const target = this.querySelector(targetCls);
    const container = this.querySelector('.sections-wrapper');
    const top = target.offsetTop;

    // const previous = this.querySelector('section.highlight-title');
    // if (previous) { previous.classList.remove('highlight-title'); }

    // target.classList.add('highlight-title');

    const offset = 0;
    container.scrollTop = top - offset;
  }

  handleCollapsibles() {
    [].slice.call(this.querySelectorAll('.collapsible')).forEach(collapsible => {
      const content = collapsible.querySelector('.section-content');

      let summaryLink = collapsible.querySelector('a[data-action="expand"]');
      if (!summaryLink) {
        summaryLink = document.createElement('a');
        summaryLink.href = '#';
        summaryLink.classList.add('icon');
        summaryLink.classList.add('icon-unfold');
        summaryLink.dataset.action = 'expand';
        summaryLink.setAttribute('aria-label', 'Expand this section');

        this.subscriptions.add(new DisposableEvent(summaryLink, 'click', e => {
          e.preventDefault();
          if (summaryLink.dataset.action === 'expand') {
            summaryLink.dataset.action = 'collapse';
            collapsible.classList.remove('collapse');
            e.target.classList.remove('icon-unfold');
            e.target.classList.add('icon-fold');
            summaryLink.setAttribute('aria-label', 'Close this section');
          } else {
            summaryLink.dataset.action = 'expand';
            collapsible.classList.add('collapse');
            e.target.classList.remove('icon-fold');
            e.target.classList.add('icon-unfold');
            summaryLink.setAttribute('aria-label', 'Expand this section');
          }
          this.scroll();
        }));
      }

      collapsible.classList.add('collapse');
      if (content.scrollHeight > content.offsetHeight) {
        collapsible.classList.add('overflow');
        collapsible.appendChild(summaryLink);
      } else {
        collapsible.classList.remove('overflow');
        if (summaryLink.parentNode) {
          collapsible.removeChild(summaryLink);
        }
      }
    });
  }
}

module.exports = KiteExpandPanel;
