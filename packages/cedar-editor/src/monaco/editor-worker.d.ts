declare module "monaco-editor/editor/editor.worker.js?worker" {
  const EditorWorker: {
    new (options?: WorkerOptions): Worker;
  };
  export default EditorWorker;
}
