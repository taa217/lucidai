import React from 'react'

export async function executeCompiledCode(compiledJsCode: string, env: Record<string, any>): Promise<React.ComponentType<any>> {
  try {
    try { console.log('CodeSlideRuntime: executeCompiledCode → compiled preview', { head: (compiledJsCode || '').slice(0, 160), length: (compiledJsCode || '').length }) } catch {}

    const module = { exports: {} as any }
    const exports = module.exports

    const componentFactory = new Function(
      ...Object.keys(env),
      'module',
      'exports',
      `
        try {
          ${compiledJsCode}
          if (module.exports && typeof module.exports === 'function') {
            return module.exports;
          }
          if (module.exports && module.exports.default && typeof module.exports.default === 'function') {
            return module.exports.default;
          }
          if (typeof Lesson !== 'undefined' && typeof Lesson === 'function') {
            return Lesson;
          }
          if (typeof _default !== 'undefined' && typeof _default === 'function') {
            return _default;
          }
          throw new Error('No valid React component exported. Ensure it exports a function component.');
        } catch (error) {
          throw new Error('Runtime execution failed: ' + (error instanceof Error ? error.message : String(error)));
        }
      `
    )

    const Component = componentFactory(...Object.values(env), module, exports)
    try { console.log('CodeSlideRuntime: executeCompiledCode → got component', { isFunction: typeof Component === 'function' }) } catch {}
    if (typeof Component !== 'function' && !(Component.prototype && Component.prototype.isReactComponent)) {
      throw new Error('The executed code did not return a valid React component function or class.')
    }
    return Component
  } catch (error: any) {
    console.error('CodeSlideRuntime: Execute code error', error)
    throw new Error(`Execution environment setup failed: ${error.message || String(error)}`)
  }
}


