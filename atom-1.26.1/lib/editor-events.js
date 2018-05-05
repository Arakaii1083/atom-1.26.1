'use strict';

const {CompositeDisposable} = require('atom');
const {StateController, Logger} = require('kite-installer');
const {MAX_FILE_SIZE, MAX_PAYLOAD_SIZE} = require('./constants');
const {last, promisifyRequest, DisposableEvent} = require('./utils');
let Kite;

class EditorEvents {
  constructor(editor) {
    if (!Kite) { Kite = require('./kite'); }
    this.editor = editor;
    this.subscriptions = new CompositeDisposable();
    this.pendingEvents = [];

    this.subscriptions.add(editor.onDidChange(changes => {
      this.send(this.buildEvent(editor, 'edit'));
    }));
    this.subscriptions.add(editor.onDidChangeSelectionRange(() => {
      this.send(this.buildEvent(editor, 'selection'));
    }));

    const view = atom.views.getView(this.editor);
    let editorHadFocus;

    // We need to track whether the editor view already had focus prior
    // to a mousedown event as we're now receiving a focus event for each click.
    // In case the editor already had focus we won't send the focus event to kited.
    this.subscriptions.add(new DisposableEvent(view, 'mousedown', () => {
      editorHadFocus = view.hasFocus();
    }));

    this.subscriptions.add(new DisposableEvent(view, 'focus', () => {
      if (!editorHadFocus) { this.focus(); }
      editorHadFocus = null;
    }));
  }

  focus() {
    this.send(this.buildEvent(this.editor, 'focus'));
  }

  dispose() {
    delete this.editor;
    this.subscriptions.dispose();
  }

  reset() {
    clearTimeout(this.timeout);
    this.pendingEvents = [];
  }

  send(event) {
    this.pendingEvents.push(event);
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.mergeEvents(), 0);
    // this.mergeEvents();
  }

  mergeEvents() {
    const event = last(this.pendingEvents);

    this.pendingEvents.forEach(e => {
      if (e.action === 'edit') {
        event.action = 'edit';
      }
    });
    this.pendingEvents = [];

    Logger.verbose(event.action, event.filename, event.selections[0]);

    const payload = JSON.stringify(event);

    if (payload.length > MAX_PAYLOAD_SIZE) {
      Logger.warn('unable to send message because length exceeded limit');
      return this.reset();
    }

    return promisifyRequest(StateController.client.request({
      path: '/clientapi/editor/event',
      method: 'POST',
    }, payload))
    .then(resp => {
      Kite.handle403Response(this.editor, resp);
      Logger.logResponse(resp);
    });
  }

  buildEvent(editor, action) {
    let text = editor.getText();
    const cursorPoint = editor.getCursorBufferPosition();
    // The TextBuffer class already provides position->char
    // index conversion with regard for unicode's surrogate pairs
    const buffer = editor.getBuffer();
    const cursorOffset = buffer.characterIndexForPosition(cursorPoint);

    // don't send content over 1mb
    if (text && text.length > MAX_FILE_SIZE) {
      action = 'skip';
      text = 'file_too_large';
    }

    return this.makeEvent(action, editor.getPath(), text, cursorOffset);
  }

  makeEvent(action, filename, text, cursor) {
    return {
      source: 'atom',
      action,
      filename,
      text,
      selections: [{
        start: cursor,
        end: cursor,
      }],
    };
  }

}

module.exports = EditorEvents;
