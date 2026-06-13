/**
 * douyin-music publish — 发布歌曲到汽水音乐 (抖音音乐开放平台).
 *
 * Strategy: UI (pure DOM automation — form fill + file upload + submit).
 *
 * Page: https://music.douyin.com/console/complete-publish
 *
 * Form fields covered:
 *  - AI创作声明 (radio: 是/否)
 *  - 使用的AI工具 (multi-select: Suno / Udio / 天音 / 海绵音乐 / 腾讯启明星 / 天工AI / Mureka / 其他)
 *  - 音乐类型 (radio: 原创/原创伴奏/翻唱/Remix)
 *  - 完整版音频 upload (required)
 *  - 歌曲片段 upload (optional)
 *  - 剪辑版 upload (optional)
 *  - 歌曲标题 (required)
 *  - 表演者 / 词作者 / 曲作者
 *  - 歌词
 *  - 授权证明 upload (optional)
 *  - 专辑信息 (名称 / 歌手 / 封面 / 厂牌 / 介绍)
 *  - 期望发行时间 / 是否已发行
 *
 * Upload inputs are tagged by their parent .douyin-music-form-field x-field-id
 * so the adapter is robust to additional hidden inputs being added before/after.
 *
 * Login: user must be logged in to music.douyin.com in main Chrome.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';

const PUBLISH_URL = 'https://music.douyin.com/console/complete-publish';

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Set a text input or textarea value via prototype setter, focusing first
 * so React's synthetic event system + Semi Form's controlled state both
 * pick up the change.
 */
async function setFieldValue(page, selector, value) {
  if (!value) return;
  const js = `
    (function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return {ok: false, error: 'not found: ' + ${JSON.stringify(selector)}};
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      el.focus();
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      return {ok: true, after: el.value};
    })()
  `;
  const result = await page.evaluate(js);
  if (!result?.ok) {
    throw new CliError('UI_ERROR', result?.error || `Failed to set ${selector}`);
  }
}

/**
 * Click a radio button by its label text, optionally scoped to a parent
 * whose text contains `scopeText`.
 * Semi Design radios: label contains hidden <input type="radio">.
 */
async function clickRadioByLabel(page, labelText, scopeText) {
  const js = `
    (function() {
      let labels = Array.from(document.querySelectorAll('label'));
      if (${JSON.stringify(scopeText)}) {
        labels = labels.filter(l => {
          let p = l.closest('.douyin-music-form-field');
          return p && p.textContent.includes(${JSON.stringify(scopeText)});
        });
      }
      const label = labels.find(l => l.textContent.trim().startsWith(${JSON.stringify(labelText)}));
      if (!label) return {ok: false, error: 'radio label not found: ' + ${JSON.stringify(labelText)}};
      label.click();
      return {ok: true};
    })()
  `;
  const result = await page.evaluate(js);
  if (!result?.ok) {
    throw new CliError('UI_ERROR', result?.error || `Failed to click radio ${labelText}`);
  }
}

/**
 * Find a text input that sits inside the same form-field as a label
 * whose text contains `labelText`.
 */
async function setFieldByLabel(page, labelText, value) {
  if (!value) return;
  const js = `
    (function() {
      const allLabels = Array.from(document.querySelectorAll('label, div, span'));
      const label = allLabels.find(l => l.textContent.trim() === ${JSON.stringify(labelText)});
      if (!label) return {ok: false, error: 'label not found: ' + ${JSON.stringify(labelText)}};
      const container = label.closest('.douyin-music-form-field') || label.parentElement;
      const input = container?.querySelector('input[type="text"], textarea');
      if (!input) return {ok: false, error: 'input not found for label: ' + ${JSON.stringify(labelText)}};
      const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      input.focus();
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
      return {ok: true};
    })()
  `;
  const result = await page.evaluate(js);
  if (!result?.ok) {
    throw new CliError('UI_ERROR', result?.error || `Failed to set field ${labelText}`);
  }
}

/**
 * Tag upload inputs by their parent form-field's `x-field-id`. Stable across
 * minor layout shuffles where extra hidden inputs may appear before existing
 * ones (which broke the previous global-index tagging).
 *
 * x-field-id mapping (verified 2026-05-05):
 *   songs[0][clips]              → 完整版 / 歌曲片段 / 剪辑版 (3 areas, distinguished by area text)
 *   songs[0][_proveFileFile]     → 授权证明 (1 input, multiple files)
 *   album[_coverValue]           → 专辑封面 (1 input)
 */
async function tagUploadsByFieldId(page) {
  const js = `
    (function() {
      const refs = [];
      const fields = Array.from(document.querySelectorAll('.douyin-music-form-field'));
      fields.forEach(field => {
        const fid = field.getAttribute('x-field-id');
        const inputs = Array.from(field.querySelectorAll('.douyin-music-upload-hidden-input, .douyin-music-upload-hidden-input-replace'));
        if (fid === 'songs[0][clips]') {
          inputs.forEach(input => {
            const area = input.closest('.douyin-music-upload');
            if (!area) return;
            const text = area.textContent.trim();
            let ref = null;
            if (text.includes('完整版')) ref = 'douyin-full-audio';
            else if (text.includes('歌曲片段')) ref = 'douyin-snippet-audio';
            else if (text.includes('剪辑版')) ref = 'douyin-clip-audio';
            if (ref) {
              input.setAttribute('data-opencli-ref', ref);
              area.setAttribute('data-opencli-ref-area', ref + '-area');
              refs.push(ref);
            }
          });
        } else if (fid === 'songs[0][_proveFileFile]' && inputs[0]) {
          inputs[0].setAttribute('data-opencli-ref', 'douyin-license-proof');
          const area = inputs[0].closest('.douyin-music-upload');
          if (area) area.setAttribute('data-opencli-ref-area', 'douyin-license-proof-area');
          refs.push('douyin-license-proof');
        } else if (fid === 'album[_coverValue]') {
          inputs.forEach((input, idx) => {
            const ref = idx === 0 ? 'douyin-album-cover' : 'douyin-album-cover-replace';
            input.setAttribute('data-opencli-ref', ref);
            refs.push(ref);
          });
          const area = field.querySelector('.douyin-music-upload');
          if (area) area.setAttribute('data-opencli-ref-area', 'douyin-album-cover-area');
          if (!inputs.length) refs.push('douyin-album-cover');
        }
      });
      return {ok: true, refs};
    })()
  `;
  return page.evaluate(js);
}

/**
 * Inspect a Semi Design Upload component's React state via fiber.
 * Returns {fileCount, hasSuccess, isDisabled} or null if the area is not found.
 *
 * Used to detect "this slot already has a file" — common when the page
 * auto-loads a draft before our adapter runs, in which case we skip the
 * upload by default.
 */
async function readUploadState(page, refBase) {
  const js = `
    (function() {
      const input = document.querySelector('[data-opencli-ref="${refBase}"]');
      const area = input ? input.closest('.douyin-music-upload') : null;
      if (!area) return null;
      const reactKey = Object.keys(area).find(k =>
        k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber')
      );
      if (!reactKey) return {fiberMissing: true};
      let fiber = area[reactKey];
      let uploadNode = null;
      while (fiber) {
        if (fiber.tag === 1 && fiber.stateNode && fiber.stateNode.foundation) {
          uploadNode = fiber;
          break;
        }
        fiber = fiber.return;
      }
      if (!uploadNode) return {fiberMissing: true};
      const inst = uploadNode.stateNode;
      const states = inst.foundation.getStates ? inst.foundation.getStates() : {};
      const props = inst.foundation.getProps ? inst.foundation.getProps() : {};
      const fileList = states.fileList || [];
      // Filter out undefined entries (can appear after direct props.onChange) and
      // synthetic "__initial" entries Semi uses internally.
      const real = fileList.filter(f => f && f.name && f.name !== '__initial');
      return {
        fileCount: real.length,
        hasSuccess: real.some(f => f.status === 'success'),
        firstName: real[0]?.name,
        propsDisabled: !!props.disabled
      };
    })()
  `;
  return page.evaluate(js);
}

/**
 * Directly inject a File object into a Semi Design Upload component by
 * finding its React fiber and calling `props.onChange`. Used as a fallback
 * when `page.setFileInput` fires the change event but the component ignores
 * it (observed for the album cover upload).
 *
 * Steps:
 *   1. Create a temporary <input type="file"> in the page.
 *   2. Use CDP `DOM.setFileInputFiles` (via page.setFileInput) on it so
 *      the browser builds a real File object.
 *   3. Read the File from the temp input via JS.
 *   4. Walk the upload area's React fiber to find the component instance.
 *   5. Call `instance.props.onChange({ target: { files: [file] } })`.
 */
async function injectFileViaReactApi(page, filePath, refBase) {
  const tempId = 'opencli-temp-file-input-' + Date.now();

  // 1. Create temp input.
  await page.evaluate(`
    (function() {
      const input = document.createElement('input');
      input.type = 'file';
      input.id = '${tempId}';
      input.style.display = 'none';
      document.body.appendChild(input);
      return {ok: true};
    })()
  `);

  // 2. Set file on temp input via CDP.
  await page.setFileInput([filePath], `#${tempId}`);
  await sleep(300);

  // 3. Read File object and inject via React API.
  const injectResult = await page.evaluate(`
    (async function() {
      const tempInput = document.getElementById('${tempId}');
      if (!tempInput || !tempInput.files || tempInput.files.length === 0) {
        return {ok: false, error: 'temp input has no files'};
      }
      const file = tempInput.files[0];

      // Find the upload area by stable x-field-id or ephemeral data-opencli-ref
      let area = null;
      const input = document.querySelector('[data-opencli-ref="${refBase}"]');
      if (input) area = input.closest('.douyin-music-upload');
      if (!area) {
        const map = {
          'douyin-full-audio': 'songs[0][clips]',
          'douyin-snippet-audio': 'songs[0][clips]',
          'douyin-clip-audio': 'songs[0][clips]',
          'douyin-license-proof': 'songs[0][_proveFileFile]',
          'douyin-album-cover': 'album[_coverValue]'
        };
        const fid = map['${refBase}'];
        if (fid) {
          const field = document.querySelector('.douyin-music-form-field[x-field-id="' + fid + '"]');
          if (field) {
            if (fid === 'songs[0][clips]') {
              const labelMap = {
                'douyin-full-audio': '完整版',
                'douyin-snippet-audio': '歌曲片段',
                'douyin-clip-audio': '剪辑版'
              };
              const areas = Array.from(field.querySelectorAll('.douyin-music-upload'));
              area = areas.find(a => a.textContent.includes(labelMap['${refBase}'])) || areas[0] || null;
            } else {
              area = field.querySelector('.douyin-music-upload');
            }
          }
        }
      }
      if (!area) return {ok: false, error: 'upload area not found'};

      const reactKey = Object.keys(area).find(k =>
        k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber')
      );
      if (!reactKey) return {ok: false, error: 'no react fiber on area'};

      let fiber = area[reactKey];
      let uploadNode = null;
      while (fiber) {
        if (fiber.tag === 1 && fiber.stateNode && fiber.stateNode.foundation) {
          uploadNode = fiber;
          break;
        }
        fiber = fiber.return;
      }
      if (!uploadNode) return {ok: false, error: 'no Upload ClassComponent found'};

      const inst = uploadNode.stateNode;
      const preStates = inst.foundation?.getStates?.() || {};
      const preFileList = (preStates.fileList || []).filter(f => f && f.name && f.name !== '__initial');

      const attempts = [];
      const dt = new DataTransfer();
      dt.items.add(file);
      const fileList = dt.files;

      // Debug: log foundation methods
      const fndMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(inst.foundation)).filter(m => typeof inst.foundation[m] === 'function');

      // ---- Patch incomplete _adapter (observed for album cover) ----
      const adapter = inst.foundation?._adapter;
      if (adapter) {
        if (typeof adapter.getProps !== 'function') {
          adapter.getProps = () => inst.props || {};
        }
        if (typeof adapter.getStates !== 'function') {
          adapter.getStates = () => inst.state || {};
        }
        if (typeof adapter.updateFileList !== 'function') {
          adapter.updateFileList = (list) => {
            if (typeof inst.setState === 'function') {
              inst.setState({ fileList: list });
            }
          };
        }
        if (typeof adapter.notifyChange !== 'function') {
          adapter.notifyChange = () => {};
        }
        if (typeof adapter.notifyRemove !== 'function') {
          adapter.notifyRemove = () => {};
        }
      }

      // Patch buildFileItem if it returns undefined uid (observed for album cover).
      try {
        if (inst.foundation && inst.foundation.buildFileItem) {
          const testItem = inst.foundation.buildFileItem(file);
          if (!testItem.uid) {
            const orig = inst.foundation.buildFileItem;
            inst.foundation.buildFileItem = function(f, el) {
              const item = orig.call(this, f, el);
              if (!item.uid) item.uid = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
              return item;
            };
            attempts.push('buildFileItem patched');
          }
        }
      } catch (e) { attempts.push('buildFileItem failed: ' + e.message); }

      // Build a proper Semi Design file item manually.
      const fileItem = {
        uid: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        fileInstance: file,
        name: file.name,
        size: file.size,
        status: 'success',
        percent: 100,
        url: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : ''
      };

      // Sanitize getState / getProps so internal Semi methods never see undefined
      // entries when they iterate fileList with .findIndex(f => f.uid === ...).
      if (inst.foundation && typeof inst.foundation.getState === 'function') {
        const origGetState = inst.foundation.getState;
        inst.foundation.getState = function(key) {
          const val = origGetState.call(this, key);
          if (key === 'fileList' && Array.isArray(val)) {
            return val.filter(f => f && typeof f === 'object');
          }
          return val;
        };
      }
      if (inst.foundation && typeof inst.foundation.getProps === 'function') {
        const origGetProps = inst.foundation.getProps;
        inst.foundation.getProps = function() {
          const p = origGetProps.call(this);
          if (p && Array.isArray(p.fileList)) {
            p.fileList = p.fileList.filter(f => f && typeof f === 'object');
          }
          if (p && Array.isArray(p.defaultFileList)) {
            p.defaultFileList = p.defaultFileList.filter(f => f && typeof f === 'object');
          }
          return p;
        };
      }

      // Pre-sanitize controlled props to prevent internal methods from crashing
      // when they iterate over arrays and access .uid on undefined items.
      if (Array.isArray(inst.props.fileList)) {
        inst.props.fileList = inst.props.fileList.filter(f => f && typeof f === 'object');
      }
      if (Array.isArray(inst.props.defaultFileList)) {
        inst.props.defaultFileList = inst.props.defaultFileList.filter(f => f && typeof f === 'object');
      }
      // Also sanitize the internal adapter's cached lists if any.
      if (adapter && Array.isArray(adapter.fileList)) {
        adapter.fileList = adapter.fileList.filter(f => f && typeof f === 'object');
      }
      if (inst.foundation && inst.foundation.replaceFileList) {
        try { inst.foundation.replaceFileList([]); attempts.push('pre-sanitize list'); } catch (e) {}
      }

      // Wrap handleChange to capture exact stack trace of the uid crash.
      let handleChangeError = null;
      if (inst.foundation && inst.foundation.handleChange) {
        const origHC = inst.foundation.handleChange;
        inst.foundation.handleChange = function(...args) {
          try {
            return origHC.apply(this, args);
          } catch (err) {
            handleChangeError = err.message + ' | ' + (err.stack || '').split(String.fromCharCode(10)).slice(0, 4).join(' ; ');
            throw err;
          }
        };
      }

      // Temporarily make the component uncontrolled so setState persists.
      const savedFileList = inst.props.fileList;
      const savedDefaultFileList = inst.props.defaultFileList;
      inst.props.fileList = undefined;
      inst.props.defaultFileList = undefined;

      // Path A: foundation.handleChange with a real FileList (most authentic).
      let midLenA = 0;
      try {
        if (inst.foundation && inst.foundation.handleChange) {
          inst.foundation.handleChange(fileList);
          attempts.push('foundation.handleChange(FileList)');
          const s = inst.foundation.getStates ? inst.foundation.getStates() : {};
          midLenA = (s.fileList || []).filter(f => f && f.name && f.name !== '__initial').length;
        }
      } catch (e) {
        attempts.push('foundation.handleChange(FileList) failed: ' + (handleChangeError || e.message));
      }

      // Path B: foundation.handleChange with raw array (some versions expect this).
      if (attempts.length === 0 || attempts[attempts.length - 1].includes('failed')) {
        handleChangeError = null;
        try {
          if (inst.foundation && inst.foundation.handleChange) {
            inst.foundation.handleChange([file]);
            attempts.push('foundation.handleChange([file])');
          }
        } catch (e) {
          attempts.push('foundation.handleChange([file]) failed: ' + (handleChangeError || e.message));
        }
      }

      // Path C: call the React component's own input-change handler.
      if (attempts.length === 0 || attempts[attempts.length - 1].includes('failed')) {
        try {
          const changeHandler = inst.onChange || inst.handleChange || inst.handleInputChange;
          if (changeHandler) {
            changeHandler.call(inst, { target: { files: fileList } });
            attempts.push('inst.onChange(event)');
          }
        } catch (e) { attempts.push('inst.onChange failed: ' + e.message); }
      }

      // Path D: adapter bridge.
      if (attempts.length === 0 || attempts[attempts.length - 1].includes('failed')) {
        try {
          const adapter2 = inst.foundation?._adapter || inst._adapter;
          if (adapter2 && adapter2.handleChange) {
            adapter2.handleChange(fileList);
            attempts.push('adapter.handleChange');
          }
        } catch (e) { attempts.push('adapter.handleChange failed: ' + e.message); }
      }

      // Path E: direct state mutation via adapter.updateFileList (bypass handleChange).
      if (attempts.every(a => a.includes('failed')) && adapter && adapter.updateFileList) {
        try {
          adapter.updateFileList([fileItem]);
          attempts.push('adapter.updateFileList direct');
        } catch (e) { attempts.push('adapter.updateFileList direct failed: ' + e.message); }
      }

      // Path F: controlled component — update via props.onChange.
      // Semi Form controls Upload via props.fileList + props.onChange.
      if (inst.props && inst.props.onChange) {
        try {
          // Semi Upload onChange receives { fileList, currentFile, event } in some versions,
          // or just the fileList array in others.
          const onChange = inst.props.onChange;
          if (typeof onChange === 'function') {
            // Try signature 1: object with fileList
            onChange({ fileList: [fileItem], currentFile: fileItem });
            attempts.push('props.onChange(object)');
          }
        } catch (e) { attempts.push('props.onChange(object) failed: ' + e.message); }
      }
      if (inst.props && inst.props.onChange) {
        try {
          inst.props.onChange([fileItem]);
          attempts.push('props.onChange(array)');
        } catch (e) { attempts.push('props.onChange(array) failed: ' + e.message); }
      }

      // Path G: find parent Form Field wrapper and update its value.
      // Walk up the fiber tree looking for a Field or Form component.
      let parentFiber = uploadNode.return;
      let fieldNode = null;
      let fieldInst = null;
      let formNode = null;
      let formApi = null;
      while (parentFiber) {
        if (parentFiber.tag === 1 && parentFiber.stateNode) {
          const pn = parentFiber.stateNode;
          if (pn && (pn.props?.field || pn.props?.name)) {
            fieldNode = pn;
            fieldInst = pn;
          }
          if (pn) {
            const api = pn.formApi || pn.state?.formApi || (typeof pn.getFormApi === 'function' ? pn.getFormApi() : null);
            if (api) {
              formNode = pn;
              formApi = api;
              break;
            }
          }
        }
        parentFiber = parentFiber.return;
      }
      const formDebug = {};
      if (formApi) {
        try { formDebug.methods = Object.keys(formApi).slice(0, 20); } catch (e) {}
        try { formDebug.fields = Object.keys(formApi.getFormState ? formApi.getFormState() : {}); } catch (e) {}
        try { formDebug.values = formApi.getValues ? formApi.getValues() : {}; } catch (e) {}
        // Detect correct cover field name by probing getValue.
        const coverCandidates = ['album._coverValue', 'album[_coverValue]', '_coverValue'];
        for (const fn of coverCandidates) {
          try {
            const v = formApi.getValue ? formApi.getValue(fn) : undefined;
            if (v !== undefined && v !== null) {
              formDebug.coverFieldName = fn;
              formDebug.coverValue = v;
              break;
            }
          } catch (e) {}
        }
      }

      // Update Field / Form value so controlled props refresh correctly.
      if (fieldInst) {
        try {
          if (typeof fieldInst.onChange === 'function') {
            fieldInst.onChange([fileItem]);
            attempts.push('fieldInst.onChange');
          } else if (typeof fieldInst.handleChange === 'function') {
            fieldInst.handleChange([fileItem]);
            attempts.push('fieldInst.handleChange');
          }
        } catch (e) {
          attempts.push('fieldInst change failed: ' + e.message);
        }
      }
      if (formApi) {
        const fieldNames = refBase === 'douyin-album-cover'
          ? [formDebug.coverFieldName, 'album._coverValue', 'album[_coverValue]', '_coverValue'].filter(Boolean)
          : ['album._coverValue', 'album[_coverValue]', '_coverValue'];
        for (const fn of fieldNames) {
          try {
            if (formApi.setValue) {
              formApi.setValue(fn, [fileItem]);
              attempts.push('formApi.setValue(' + fn + ')');
            }
          } catch (e) { attempts.push('formApi.setValue(' + fn + ') failed: ' + e.message); }
          try {
            if (formApi.setValues) {
              formApi.setValues({ [fn]: [fileItem] });
              attempts.push('formApi.setValues(' + fn + ')');
            }
          } catch (e) { attempts.push('formApi.setValues(' + fn + ') failed: ' + e.message); }
        }
        try {
          if (formApi.validate) {
            formApi.validate();
            attempts.push('formApi.validate');
          }
        } catch (e) { attempts.push('formApi.validate failed: ' + e.message); }
      }

      // Path H: if component is controlled via props.fileList, mutate props directly
      // and force re-render. This is a last resort for controlled components.
      const propsSnapshot = {};
      try {
        const p = inst.props || {};
        propsSnapshot.keys = Object.keys(p);
        propsSnapshot.hasFileList = p.fileList !== undefined;
        propsSnapshot.hasValue = p.value !== undefined;
        propsSnapshot.hasDefaultFileList = p.defaultFileList !== undefined;
        propsSnapshot.fileListLen = Array.isArray(p.fileList) ? p.fileList.length : 'n/a';
        if (Array.isArray(p.fileList) && p.fileList[0]) {
          propsSnapshot.firstFileListItem = {
            uid: p.fileList[0].uid,
            name: p.fileList[0].name,
            status: p.fileList[0].status,
            size: p.fileList[0].size,
            url: typeof p.fileList[0].url === 'string' ? p.fileList[0].url.slice(0, 60) : 'n/a'
          };
        }
        if (p.fileList !== undefined) {
          try {
            inst.props.fileList = [fileItem];
            attempts.push('props.fileList direct');
          } catch (e) { attempts.push('props.fileList direct failed: ' + e.message); }
        }
      } catch (e) { propsSnapshot.error = e.message; }

      // Path I: Simulate what Semi Form's <Field> wrapper does — call the component
      // with a fully synthesized event that includes DataTransfer.
      if (inst.props && inst.props.onChange) {
        try {
          const syntheticEvent = {
            target: { files: fileList },
            currentTarget: { files: fileList },
            preventDefault: () => {},
            stopPropagation: () => {},
            nativeEvent: { target: { files: fileList } }
          };
          inst.props.onChange(syntheticEvent);
          attempts.push('props.onChange(syntheticEvent)');
        } catch (e) { attempts.push('props.onChange(syntheticEvent) failed: ' + e.message); }
      }

      // Path J: use foundation.replaceFileList to directly overwrite the list
      // without going through handleChange's internal processing.
      if (inst.foundation && inst.foundation.replaceFileList) {
        try {
          inst.foundation.replaceFileList([fileItem]);
          attempts.push('foundation.replaceFileList');
        } catch (e) { attempts.push('foundation.replaceFileList failed: ' + e.message); }
      }

      // Path K: use foundation.addFilesToList to append directly.
      if (inst.foundation && inst.foundation.addFilesToList) {
        try {
          inst.foundation.addFilesToList([fileItem]);
          attempts.push('foundation.addFilesToList');
        } catch (e) { attempts.push('foundation.addFilesToList failed: ' + e.message); }
      }

      // Path L: clear any corrupted state first, then handleChange.
      if (inst.foundation && inst.foundation.replaceFileList) {
        try {
          inst.foundation.replaceFileList([]);
          attempts.push('pre-clear list');
          await new Promise(r => setTimeout(r, 100));
          inst.foundation.handleChange(fileList);
          attempts.push('handleChange after clear');
        } catch (e) { attempts.push('handleChange after clear failed: ' + e.message); }
      }

      // Poll Foundation state for up to 3s, then force React re-render.
      let postFileListLen = 0;
      let postLastStatus = null;
      for (let poll = 0; poll < 30; poll++) {
        const postStates = inst.foundation?.getStates?.() || {};
        const postList = (postStates.fileList || []).filter(f => f && f.name && f.name !== '__initial');
        postFileListLen = postList.length;
        postLastStatus = postList[postList.length - 1]?.status;
        if (postFileListLen > 0) break;
        await new Promise(r => setTimeout(r, 100));
      }

      // Do NOT restore controlled props — keeping Upload uncontrolled lets
      // the internal state from handleChange survive.  Parent form value is
      // updated separately via formApi/fieldInst above, so on the next
      // re-render the controlled prop will be correct.
      // inst.props.fileList = savedFileList;
      // inst.props.defaultFileList = savedDefaultFileList;

      // Force re-render so parent Field picks up new form state / Upload
      // picks up new internal state.
      if (fieldNode && typeof fieldNode.forceUpdate === 'function') {
        fieldNode.forceUpdate();
      }
      if (typeof inst.forceUpdate === 'function') {
        inst.forceUpdate();
      } else if (typeof inst.setState === 'function') {
        inst.setState({ ...inst.state });
      }

      return {
        ok: true,
        attempts,
        fndMethods: fndMethods.slice(0, 20),
        preFileListLen: preFileList.length,
        midLenA,
        postFileListLen,
        postLastStatus,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        hasFieldNode: !!fieldNode,
        hasFormNode: !!formNode,
        formDebug,
        propsSnapshot
      };
    })()
  `);

  // Clean up temp input.
  await page.evaluate(`
    (function() {
      const el = document.getElementById('${tempId}');
      if (el) el.remove();
    })()
  `);

  if (!injectResult?.ok) {
    throw new CliError('UPLOAD_ERROR', `React API fallback failed for ${refBase}: ${injectResult?.error || 'unknown'}`);
  }

  // Re-tag because React may have re-rendered.
  await sleep(1000);
  await tagUploadsByFieldId(page);

  return injectResult;
}

/**
 * Upload a file through a Semi Design hidden file input previously tagged
 * by tagUploadsByFieldId.
 *
 * Behaviour:
 *   - If the slot already holds a successfully-uploaded file and `replace`
 *     is false (the default), skip silently. The page auto-loads the user's
 *     most recent draft, so re-running publish would otherwise hang here.
 *   - With `replace: true`, target the area's `-replace` input (Semi's
 *     swap-file input) instead.
 *   - If the primary `setFileInput` approach does not trigger the component
 *     (observed for album cover), falls back to `injectFileViaReactApi`.
 */
async function uploadFile(page, filePath, refBase, opts = {}) {
  const replace = !!opts.replace;
  let lastInjectResult = null;

  // 1. Re-tag (idempotent) so we always target a current input.
  await tagUploadsByFieldId(page);

  // 2. Detect existing file via React state.
  const existing = await readUploadState(page, refBase);
  if (existing && existing.hasSuccess && !replace) {
    return { skipped: true, reason: 'already-uploaded', name: existing.firstName };
  }

  // 3. Enable the area if disabled. When replacing, first delete the existing
  //    file so the original input becomes active again.
  const enableJs = `
    (function() {
      let area = null;
      const input = document.querySelector('[data-opencli-ref="${refBase}"]');
      if (input) area = input.closest('.douyin-music-upload');
      if (!area) {
        const map = {
          'douyin-full-audio': 'songs[0][clips]',
          'douyin-snippet-audio': 'songs[0][clips]',
          'douyin-clip-audio': 'songs[0][clips]',
          'douyin-license-proof': 'songs[0][_proveFileFile]',
          'douyin-album-cover': 'album[_coverValue]'
        };
        const fid = map['${refBase}'];
        if (fid) {
          const field = document.querySelector('.douyin-music-form-field[x-field-id="' + fid + '"]');
          if (field) {
            if (fid === 'songs[0][clips]') {
              const labelMap = {
                'douyin-full-audio': '完整版',
                'douyin-snippet-audio': '歌曲片段',
                'douyin-clip-audio': '剪辑版'
              };
              const areas = Array.from(field.querySelectorAll('.douyin-music-upload'));
              area = areas.find(a => a.textContent.includes(labelMap['${refBase}'])) || areas[0] || null;
            } else {
              area = field.querySelector('.douyin-music-upload');
            }
          }
        }
      }
      if (!area) return {ok: false, error: 'area not found: ${refBase}'};
      if (area.classList.contains('douyin-music-upload-disabled')) {
        area.classList.remove('douyin-music-upload-disabled');
      }
      return {ok: true, areaHtml: area.outerHTML.trim().slice(0, 400)};
    })()
  `;
  const enableResult = await page.evaluate(enableJs);
  if (!enableResult?.ok) {
    throw new CliError('UI_ERROR', enableResult?.error || `Failed to find upload area ${refBase}`);
  }

  // 3a. When replacing, attempt to clear the existing file.
  //    For single-file uploads the component usually overwrites on the next
  //    change event, so if deletion fails we still proceed with the upload.
  if (replace && existing && existing.hasSuccess) {
    const delJs = `
      (function() {
        let area = null;
        const input = document.querySelector('[data-opencli-ref="${refBase}"]');
        if (input) area = input.closest('.douyin-music-upload');
        if (!area) {
          const map = {
            'douyin-full-audio': 'songs[0][clips]',
            'douyin-snippet-audio': 'songs[0][clips]',
            'douyin-clip-audio': 'songs[0][clips]',
            'douyin-license-proof': 'songs[0][_proveFileFile]',
            'douyin-album-cover': 'album[_coverValue]'
          };
          const fid = map['${refBase}'];
          if (fid) {
            const field = document.querySelector('.douyin-music-form-field[x-field-id="' + fid + '"]');
            if (field) {
              if (fid === 'songs[0][clips]') {
                const labelMap = {
                  'douyin-full-audio': '完整版',
                  'douyin-snippet-audio': '歌曲片段',
                  'douyin-clip-audio': '剪辑版'
                };
                const areas = Array.from(field.querySelectorAll('.douyin-music-upload'));
                area = areas.find(a => a.textContent.includes(labelMap['${refBase}'])) || areas[0] || null;
              } else {
                area = field.querySelector('.douyin-music-upload');
              }
            }
          }
        }
        if (!area) return {ok: false, error: 'upload area not found'};

        // React API: clear fileList via foundation and form API
        let reactRemoved = [];
        const reactKey = Object.keys(area).find(k =>
          k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber')
        );
        if (reactKey) {
          let fiber = area[reactKey];
          let uploadNode = null;
          while (fiber) {
            if (fiber.stateNode && fiber.stateNode.foundation) {
              uploadNode = fiber;
              break;
            }
            fiber = fiber.return;
          }
          if (uploadNode) {
            const inst = uploadNode.stateNode;
            if (inst.foundation && inst.foundation.replaceFileList) {
              try { inst.foundation.replaceFileList([]); reactRemoved.push('replaceFileList'); }
              catch (e) { reactRemoved.push('replaceFileList fail: ' + e.message); }
            }
            if (reactRemoved.length === 0 && inst.props && inst.props.onRemove) {
              const states = inst.foundation.getStates ? inst.foundation.getStates() : {};
              const fileList = (states.fileList || []).filter(f => f && f.name && f.name !== '__initial');
              for (const f of fileList) {
                try { inst.props.onRemove(f, fileList, {event: new Event('click')}); reactRemoved.push(f.name + '-onRemove'); }
                catch (e) {}
              }
            }
            if (reactRemoved.length === 0 && typeof inst.setState === 'function') {
              inst.setState({fileList: []});
              reactRemoved.push('setState');
            }
            // Also clear parent form state so controlled props don't override.
            let parentFiber = uploadNode.return;
            while (parentFiber) {
              if (parentFiber.tag === 1 && parentFiber.stateNode) {
                const pn = parentFiber.stateNode;
                const formApi = pn.formApi || pn.state?.formApi || (typeof pn.getFormApi === 'function' ? pn.getFormApi() : null);
                if (formApi && formApi.setValue) {
                  const fieldMap = {
                    'douyin-full-audio': null,
                    'douyin-snippet-audio': null,
                    'douyin-clip-audio': null,
                    'douyin-license-proof': null,
                    'douyin-album-cover': 'album._coverValue'
                  };
                  const fieldName = fieldMap['${refBase}'];
                  if (fieldName) {
                    try { formApi.setValue(fieldName, null); reactRemoved.push('formClear:' + fieldName); }
                    catch (e) {}
                    if (fieldName === 'album._coverValue') {
                      try { formApi.setValue('album[_coverValue]', null); reactRemoved.push('formClear:album[_coverValue]'); }
                      catch (e) {}
                    }
                  }
                  break;
                }
              }
              parentFiber = parentFiber.return;
            }
          }
        }

        // DOM fallback: click visible close/delete icons
        let domClicked = false;
        const scope = area.closest('.douyin-music-form-field') || area;
        const icons = scope.querySelectorAll('.semi-upload-file-card-close, .semi-upload-file-card-icon, .semi-icon-close, .semi-icon-delete, [class*="file-card"] svg');
        for (const icon of icons) {
          const target = icon.closest('button, span, div, [role="button"]') || icon;
          const rect = target.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            target.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
            domClicked = true;
            break;
          }
        }
        if (!domClicked) {
          const btns = scope.querySelectorAll('button[class*="delete"], button[class*="remove"], button[class*="close"], [role="button"][class*="delete"], [role="button"][class*="remove"], [role="button"][class*="close"]');
          for (const btn of btns) {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              btn.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
              domClicked = true;
              break;
            }
          }
        }

        return {ok: true, reactRemoved, domClicked};
      })()
    `;
    const delResult = await page.evaluate(delJs);
    if (!delResult?.ok) {
      throw new CliError('UI_ERROR', delResult?.error || `Failed to delete existing file for ${refBase}`);
    }

    await dismissAnyDialog(page);
    await sleep(800);

    // Wait up to 12s for state to clear; if it never does we still proceed
    // because the upcoming setFileInput may overwrite the existing single-file slot.
    let cleared = false;
    for (let d = 0; d < 12; d++) {
      await sleep(1000);
      const afterDel = await readUploadState(page, refBase);
      if (!afterDel || afterDel.fileCount === 0) {
        cleared = true;
        break;
      }
      await dismissAnyDialog(page);
    }
    if (cleared) {
      await tagUploadsByFieldId(page);
      await sleep(300);
    }
    // If not cleared, continue anyway — the upload step will attempt injection.
  }

  // 4. Inject the file.
  // Re-tag immediately before setFileInput in case delete/re-enable caused a re-render.
  await tagUploadsByFieldId(page);
  await sleep(200);

  // Click the upload area first to ensure the hidden input is "active".
  await page.evaluate(`
    (function() {
      let area = null;
      const input = document.querySelector('[data-opencli-ref="${refBase}"]');
      if (input) area = input.closest('.douyin-music-upload');
      if (!area) {
        const map = {
          'douyin-full-audio': 'songs[0][clips]',
          'douyin-snippet-audio': 'songs[0][clips]',
          'douyin-clip-audio': 'songs[0][clips]',
          'douyin-license-proof': 'songs[0][_proveFileFile]',
          'douyin-album-cover': 'album[_coverValue]'
        };
        const fid = map['${refBase}'];
        if (fid) {
          const field = document.querySelector('.douyin-music-form-field[x-field-id="' + fid + '"]');
          if (field) {
            if (fid === 'songs[0][clips]') {
              const labelMap = {
                'douyin-full-audio': '完整版',
                'douyin-snippet-audio': '歌曲片段',
                'douyin-clip-audio': '剪辑版'
              };
              const areas = Array.from(field.querySelectorAll('.douyin-music-upload'));
              area = areas.find(a => a.textContent.includes(labelMap['${refBase}'])) || areas[0] || null;
            } else {
              area = field.querySelector('.douyin-music-upload');
            }
          }
        }
      }
      if (area) {
        // Focus the area and click its clickable surface so Semi mounts the input listener.
        area.focus();
        const clickable = area.querySelector('button, [role="button"], .semi-upload-drag-area') || area;
        clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
      return {ok: true};
    })()
  `);
  await sleep(400);
  // Re-tag once more — the click may have triggered a lazy mount of the input.
  await tagUploadsByFieldId(page);
  await sleep(200);

  await page.setFileInput([filePath], `[data-opencli-ref="${refBase}"]`);

  // 4a. Re-tag after React re-render (setFileInput triggers component update,
  //     which destroys and recreates the DOM, losing our data-opencli-ref).
  await sleep(1500);
  await tagUploadsByFieldId(page);

  // 4b. Fallback for components that ignore the synthetic change event from
  //     setFileInput (observed for album cover). After a brief grace period,
  //     check React state; if the component still has no file, try the
  //     -replace input or inject directly via its React API.
  await sleep(2000);
  let postInject = await readUploadState(page, refBase);
  if (!postInject || postInject.fileCount === 0) {
    // Try the -replace input if available (re-tag first to catch any new inputs).
    await tagUploadsByFieldId(page);
    const replaceRef = refBase + '-replace';
    const hasReplace = await page.evaluate(`
      (function() {
        return !!document.querySelector('[data-opencli-ref="${replaceRef}"]');
      })()
    `);
    if (hasReplace) {
      await page.setFileInput([filePath], '[data-opencli-ref="' + replaceRef + '"]');
      await sleep(2000);
      postInject = await readUploadState(page, refBase);
    }
    if (!postInject || postInject.fileCount === 0) {
      lastInjectResult = await injectFileViaReactApi(page, filePath, refBase);
      await sleep(3000);
      await tagUploadsByFieldId(page);
    }
  }

  // 6. Wait for completion.
  const maxWaitSec = 120;
  let lastDomCheck = null;
  let lastFiberCheck = null;
  for (let i = 0; i < maxWaitSec; i++) {
    await sleep(1000);
    await dismissAnyDialog(page);

    const check = await page.evaluate(`
      (function() {
        function findAreaByFieldId(refBase) {
          const map = {
            'douyin-full-audio':      'songs[0][clips]',
            'douyin-snippet-audio':   'songs[0][clips]',
            'douyin-clip-audio':      'songs[0][clips]',
            'douyin-license-proof':   'songs[0][_proveFileFile]',
            'douyin-album-cover':     'album[_coverValue]'
          };
          const fid = map[refBase];
          if (!fid) return null;
          const field = document.querySelector('.douyin-music-form-field[x-field-id="' + fid + '"]');
          if (!field) return null;
          if (fid === 'songs[0][clips]') {
            const areas = Array.from(field.querySelectorAll('.douyin-music-upload'));
            const labelMap = {
              'douyin-full-audio':    '完整版',
              'douyin-snippet-audio': '歌曲片段',
              'douyin-clip-audio':    '剪辑版'
            };
            const label = labelMap[refBase];
            for (const a of areas) {
              if (a.textContent.includes(label)) return a;
            }
            return areas[0] || null;
          }
          return field.querySelector('.douyin-music-upload') || null;
        }

        let area = findAreaByFieldId('${refBase}');
        if (!area) {
          const input = document.querySelector('[data-opencli-ref="${refBase}"]');
          area = input ? input.closest('.douyin-music-upload') : null;
        }
        if (!area) return {found: false, html: ''};
        const text = area.textContent;
        const hasFileName = /\\.(mp3|wav|m4a|ogg|jpg|jpeg|png|pdf|zip)/i.test(text);
        const hasSuccess = text.includes('成功') || text.includes('完成');
        const hasError = text.includes('失败') || text.includes('错误') || text.includes('不符合');
        const hasFileItem = area.querySelector('[class*="file"], [class*="item"], [class*="list"]') !== null;
        const hasDeleteBtn = area.querySelector('button, [class*="delete"], [class*="remove"]') !== null;
        const hasImg = area.querySelector('img') !== null;
        return {
          found: true,
          hasFileName,
          hasSuccess,
          hasError,
          hasFileItem,
          hasDeleteBtn,
          hasImg,
          text: text.trim().slice(0, 120),
          html: area.outerHTML.trim().slice(0, 600)
        };
      })()
    `);
    lastDomCheck = check;
    if (check?.hasError) {
      throw new CliError('UPLOAD_ERROR', `${refBase} 上传失败: ${check.text}`);
    }
    if (check?.hasFileName || check?.hasSuccess || check?.hasImg || check?.hasDeleteBtn) {
      return;
    }

    if (i >= 4) {
      const fiberCheck = await page.evaluate(`
        (function() {
          let area = null;
          const input = document.querySelector('[data-opencli-ref="${refBase}"]');
          if (input) area = input.closest('.douyin-music-upload');
          if (!area) {
            const map = {
              'douyin-full-audio': 'songs[0][clips]',
              'douyin-snippet-audio': 'songs[0][clips]',
              'douyin-clip-audio': 'songs[0][clips]',
              'douyin-license-proof': 'songs[0][_proveFileFile]',
              'douyin-album-cover': 'album[_coverValue]'
            };
            const fid = map['${refBase}'];
            if (fid) {
              const field = document.querySelector('.douyin-music-form-field[x-field-id="' + fid + '"]');
              if (field) {
                if (fid === 'songs[0][clips]') {
                  const labelMap = {
                    'douyin-full-audio': '完整版',
                    'douyin-snippet-audio': '歌曲片段',
                    'douyin-clip-audio': '剪辑版'
                  };
                  const areas = Array.from(field.querySelectorAll('.douyin-music-upload'));
                  area = areas.find(a => a.textContent.includes(labelMap['${refBase}'])) || areas[0] || null;
                } else {
                  area = field.querySelector('.douyin-music-upload');
                }
              }
            }
          }
          if (!area) return {areaFound: false};
          const reactKey = Object.keys(area).find(k =>
            k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber')
          );
          if (!reactKey) return {areaFound: true, hasFiber: false};
          let fiber = area[reactKey];
          let uploadNode = null;
          while (fiber) {
            if (fiber.tag === 1 && fiber.stateNode) {
              uploadNode = fiber;
              break;
            }
            fiber = fiber.return;
          }
          if (!uploadNode) return {areaFound: true, hasFiber: true, hasUploadNode: false};
          const inst = uploadNode.stateNode;
          const states = inst.foundation?.getStates?.() || {};
          const fileList = states.fileList || [];
          const real = fileList.filter(f => f && f.name && f.name !== '__initial');
          const lastFile = real[real.length - 1];
          return {
            areaFound: true,
            hasFiber: true,
            hasUploadNode: true,
            fileListLen: real.length,
            lastStatus: lastFile?.status,
            lastName: lastFile?.name,
            lastValidateMsg: lastFile?.validateMessage,
          };
        })()
      `);
      lastFiberCheck = fiberCheck;
      if (fiberCheck?.lastStatus === 'success') {
        return;
      }
      if (fiberCheck?.lastStatus === 'validateFail') {
        const msg = fiberCheck.lastValidateMsg || '文件未通过验证（如音频时长不足60秒、图片分辨率不足）';
        throw new CliError('UPLOAD_VALIDATION', `${refBase} 验证失败: ${msg}`);
      }
    }
  }
  const debug = JSON.stringify({ dom: lastDomCheck, fiber: lastFiberCheck, inject: lastInjectResult });
  throw new CliError('UPLOAD_TIMEOUT', `${refBase} 上传超时（${maxWaitSec}s）。调试信息: ${debug}`);
}

/**
 * Open a Semi Design <Select multiple> by its element id, click each option
 * matching `values`, then close the dropdown.
 *
 * Returns the list of values that were actually clicked (for debugging).
 */
async function selectMultiSelect(page, selectId, values) {
  if (!values || values.length === 0) return [];
  // 1. Open the combobox.
  const openResult = await page.evaluate(`
    (function() {
      const sel = document.getElementById(${JSON.stringify(selectId)});
      if (!sel) return {ok: false, error: 'select not found: ' + ${JSON.stringify(selectId)}};
      // Already open?
      if (sel.getAttribute('aria-expanded') !== 'true') sel.click();
      return {ok: true};
    })()
  `);
  if (!openResult?.ok) {
    throw new CliError('UI_ERROR', openResult?.error || `Failed to open select ${selectId}`);
  }
  await sleep(400);

  // 2. Click each option.
  const clicked = [];
  for (const v of values) {
    const result = await page.evaluate(`
      (function() {
        const portals = Array.from(document.querySelectorAll('[id^="douyin-music-select-"]'));
        let opt = null;
        let available = [];
        for (const p of portals) {
          const opts = Array.from(p.querySelectorAll('[role="option"]'));
          available = available.concat(opts.map(o => o.textContent.trim()));
          opt = opts.find(o => o.textContent.trim() === ${JSON.stringify(v)});
          if (opt) break;
        }
        if (!opt) return {ok: false, available};
        // Skip if already selected (Semi marks selected options with aria-selected="true")
        if (opt.getAttribute('aria-selected') === 'true') return {ok: true, alreadySelected: true};
        opt.click();
        return {ok: true};
      })()
    `);
    if (!result?.ok) {
      throw new CliError(
        'INVALID_ARG',
        `AI tool not found: ${v}, available: ${(result?.available || []).join(', ')}`
      );
    }
    clicked.push(v);
    await sleep(200);
  }

  // 3. Close the dropdown by clicking the combobox header again or pressing escape.
  await page.evaluate(`
    (function() {
      const sel = document.getElementById(${JSON.stringify(selectId)});
      if (sel && sel.getAttribute('aria-expanded') === 'true') sel.click();
      // Also click body to ensure focus moves out
      document.body.click();
    })()
  `);
  await sleep(300);
  return clicked;
}

/**
 * Suppress native browser dialogs (alert/confirm/prompt) and try to block
 * beforeunload dialogs by monkey-patching window methods.
 */
async function suppressDialogs(page) {
  await page.evaluate(`
    (function() {
      if (window.__opencliDialogsSuppressed) return;
      window.__opencliDialogsSuppressed = true;
      window.confirm = function() { return true; };
      window.alert = function() {};
      window.prompt = function() { return ''; };
      window.onbeforeunload = null;
      // Block future beforeunload listeners
      const orig = window.addEventListener;
      window.addEventListener = function(type, fn, opts) {
        if (type === 'beforeunload') return;
        return orig.call(this, type, fn, opts);
      };
    })()
  `);
}

/**
 * Dismiss any visible modal / dialog on the page.
 * Covers:
 *   - Semi Design modals (buttons: 确认 / 确定 / 我知道了)
 *   - Generic overlay dialogs with primary button
 * Returns true if a dialog was found and dismissed.
 */
async function dismissAnyDialog(page) {
  const result = await page.evaluate(`
    (function() {
      // 1. Semi Design modal
      const modalBtns = Array.from(document.querySelectorAll('.semi-modal .semi-button, .semi-dialog .semi-button, [class*="modal"] button, [class*="dialog"] button'));
      const confirmTexts = ['确认', '确定', '我知道了', '是的', '好的', '同意', '继续'];
      for (const btn of modalBtns) {
        const text = btn.textContent.trim();
        if (confirmTexts.includes(text) || btn.classList.contains('semi-button-primary') || btn.classList.contains('semi-button-danger')) {
          btn.click();
          return {dismissed: true, type: 'modal', text};
        }
      }

      // 2. Generic overlay with prominent button
      const overlays = document.querySelectorAll('[class*="overlay"], [class*="mask"]');
      for (const ov of overlays) {
        if (ov.offsetParent === null) continue;
        const btn = ov.querySelector('button');
        if (btn) {
          btn.click();
          return {dismissed: true, type: 'overlay'};
        }
      }

      // 3. Toast / notification close buttons
      const toasts = document.querySelectorAll('.semi-toast-wrapper, .semi-notification-wrapper, [class*="toast"], [class*="message"]');
      for (const t of toasts) {
        const closeBtn = t.querySelector('[class*="close"], button');
        if (closeBtn) {
          closeBtn.click();
          return {dismissed: true, type: 'toast'};
        }
      }

      return {dismissed: false};
    })()
  `);
  if (result?.dismissed) {
    await sleep(400);
  }
  return !!result?.dismissed;
}

cli({
  site: 'douyin-music',
  name: 'publish',
  description: '发布歌曲到汽水音乐（抖音音乐开放平台）',
  domain: 'music.douyin.com',
  strategy: Strategy.UI,
  browser: true,
  access: 'write',
  args: [
    {
      name: 'audio',
      type: 'string',
      required: true,
      help: '完整版音频文件本地路径（mp3/m4a/wav）',
    },
    {
      name: 'cover',
      type: 'string',
      required: true,
      help: '封面图片本地路径（jpg/png，分辨率 ≥ 1440×1440）',
    },
    {
      name: 'title',
      type: 'string',
      required: true,
      help: '歌曲标题',
    },
    {
      name: 'lyrics',
      type: 'string',
      help: '歌词文本（可选）',
    },
    {
      name: 'artist',
      type: 'string',
      help: '表演者（可选）',
    },
    {
      name: 'lyricist',
      type: 'string',
      help: '词作者（可选）',
    },
    {
      name: 'composer',
      type: 'string',
      help: '曲作者（可选）',
    },
    {
      name: 'album',
      type: 'string',
      help: '专辑名称（可选）',
    },
    {
      name: 'album-artist',
      type: 'string',
      help: '专辑歌手（可选）',
    },
    {
      name: 'record-company',
      type: 'string',
      help: '所属厂牌（可选）',
    },
    {
      name: 'album-intro',
      type: 'string',
      help: '专辑介绍（可选）',
    },
    {
      name: 'release-date',
      type: 'string',
      help: '期望发行时间（可选，格式如 2026-06-01）',
    },
    {
      name: 'snippet-audio',
      type: 'string',
      help: '歌曲片段音频本地路径（可选）',
    },
    {
      name: 'license-proof',
      type: 'string',
      help: '授权证明文件本地路径（zip/jpg/png/pdf，可选）',
    },
    {
      name: 'ai-created',
      type: 'bool',
      default: true,
      help: '声明歌曲使用AI创作（默认 true）',
    },
    {
      name: 'ai-tools',
      type: 'string',
      default: 'Suno',
      help: '使用的AI工具，逗号分隔（默认 Suno；可选: Suno/Udio/天音/海绵音乐/腾讯启明星/天工AI/Mureka/其他）',
    },
    {
      name: 'music-type',
      type: 'string',
      default: '原创',
      help: '音乐类型: 原创 / 原创伴奏 / 翻唱 / Remix（默认 原创）',
    },
    {
      name: 'already-released',
      type: 'bool',
      default: false,
      help: '歌曲是否已发行（默认 false）',
    },
    {
      name: 'dry-run',
      type: 'bool',
      default: false,
      help: '只填写表单不上传提交（用于测试）',
    },
    {
      name: 'timeout',
      type: 'int',
      default: 120,
      help: '页面操作超时秒数（默认 120）',
    },
  ],
  columns: ['title', 'status', 'message'],
  func: async (page, args) => {
    if (!page.setFileInput) {
      throw new CliError('UNSUPPORTED', 'current opencli page lacks setFileInput — file upload needs CDP DOM.setFileInputFiles');
    }

    // ── 1. Navigate ──
    await page.goto(PUBLISH_URL, { waitUntil: 'none' });
    await page.wait(5);

    // 1a. Suppress native dialogs and beforeunload prompts.
    await suppressDialogs(page);

    // ── 2. Tag upload inputs by stable x-field-id ──
    const tagResult = await tagUploadsByFieldId(page);
    if (!tagResult?.ok || !tagResult.refs?.includes('douyin-full-audio') || !tagResult.refs?.includes('douyin-album-cover')) {
      throw new CliError(
        'UI_ERROR',
        `Could not tag upload inputs by x-field-id (got: ${(tagResult?.refs || []).join(', ')}) — page structure may have changed`
      );
    }

    // ── 3. AI创作声明 ──
    if (args['ai-created']) {
      await clickRadioByLabel(page, '是', '以下歌曲均使用AI创作');
      await sleep(400);

      // 3a. 使用的AI工具 (multi-select)
      const aiTools = (args['ai-tools'] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (aiTools.length > 0) {
        await selectMultiSelect(page, 'aiTools[makeWithAIToolNames]', aiTools);
      }
    } else {
      await clickRadioByLabel(page, '否', '以下歌曲均使用AI创作');
    }
    await sleep(300);

    // ── 4. 音乐类型 ──
    const musicType = args['music-type'];
    const validTypes = ['原创', '原创伴奏', '翻唱', 'Remix'];
    if (!validTypes.includes(musicType)) {
      throw new CliError('INVALID_ARG', `music-type must be one of: ${validTypes.join(', ')}`);
    }
    await clickRadioByLabel(page, musicType);
    await sleep(300);

    // ── 5. Upload 完整版音频 ──
    await uploadFile(page, args.audio, 'douyin-full-audio', { replace: true });

    // ── 6. Upload 歌曲片段（optional） ──
    if (args['snippet-audio']) {
      await uploadFile(page, args['snippet-audio'], 'douyin-snippet-audio');
    }

    // ── 7. 歌曲标题 ──
    await setFieldValue(page, '#songs\\[0\\]\\[title\\]', args.title);
    await sleep(200);
    await dismissAnyDialog(page);

    // ── 8. 表演者 / 词作者 / 曲作者 ──
    if (args.artist) {
      await setFieldByLabel(page, '表演者', args.artist);
      await sleep(200);
    }
    if (args.lyricist) {
      await setFieldByLabel(page, '词作者', args.lyricist);
      await sleep(200);
    }
    if (args.composer) {
      await setFieldByLabel(page, '曲作者', args.composer);
      await sleep(200);
    }

    // ── 9. 歌词 ──
    if (args.lyrics) {
      await setFieldValue(page, '#songs\\[0\\]\\[lyricText\\]', args.lyrics);
      await sleep(200);
    }

    // ── 10. 授权证明（optional） ──
    if (args['license-proof']) {
      await uploadFile(page, args['license-proof'], 'douyin-license-proof');
    }

    // ── 11. 专辑信息 ──
    if (args.album) {
      await setFieldValue(page, '#album\\[albumName\\]', args.album);
      await sleep(200);
    }
    if (args['album-artist']) {
      await setFieldByLabel(page, '专辑歌手', args['album-artist']);
      await sleep(200);
    }

    // ── 12. 专辑封面 ──
    if (args.cover) {
      await uploadFile(page, args.cover, 'douyin-album-cover', { replace: true });
    }
    await dismissAnyDialog(page);

    // ── 13. 期望发行时间 ──
    if (args['release-date']) {
      await setFieldValue(page, 'input[type="text"][placeholder*="授权成功后"]', args['release-date']);
      await sleep(200);
    }

    // ── 14. 是否已发行 ──
    if (args['already-released']) {
      await clickRadioByLabel(page, '是', '是否已发行');
    }

    // ── 15. 所属厂牌 ──
    if (args['record-company']) {
      await setFieldValue(page, '#album\\[recordCompany\\]', args['record-company']);
      await sleep(200);
    }

    // ── 16. 专辑介绍 ──
    if (args['album-intro']) {
      await setFieldValue(page, '#album\\[intro\\]', args['album-intro']);
      await sleep(200);
    }

    // ── 17. Submit: click 保存 ──
    await dismissAnyDialog(page);
    if (args['dry-run']) {
      return [{ title: args.title, status: 'dry_run', message: '干跑模式: 表单已填写完成，未点击提交' }];
    }

    const DRAFT_PATTERN = 'music.douyin.com/console/api/v1/draft/create';
    await page.installInterceptor(DRAFT_PATTERN);

    const submitJs = `
      (function() {
        const btns = Array.from(document.querySelectorAll('button'));
        const saveBtn = btns.find(b => b.textContent.trim() === '保存' && b.offsetParent !== null);
        if (!saveBtn) return {ok: false, error: '保存 button not found or not visible'};
        saveBtn.click();
        return {ok: true};
      })()
    `;
    const submitResult = await page.evaluate(submitJs);
    if (!submitResult?.ok) {
      throw new CliError('UI_ERROR', submitResult?.error || 'Failed to click 保存');
    }

    const SAVE_MAX_WAIT_MS = 60000;
    const saveStart = Date.now();
    let draftId = null;
    let draftUrl = null;
    let saveError = null;

    while (Date.now() - saveStart < SAVE_MAX_WAIT_MS) {
      const intercepted = await page.getInterceptedRequests();
      for (const body of intercepted || []) {
        if (!body || typeof body !== 'object') continue;
        draftId =
          body?.data?.id ??
          body?.data?.draft_id ??
          body?.draft_id ??
          body?.id ??
          null;
        draftUrl = body?.data?.url ?? body?.url ?? null;
        if (draftId) break;
      }
      if (draftId) break;

      const toastCheck = await page.evaluate(`
        (function() {
          const toasts = Array.from(document.querySelectorAll('.semi-toast-wrapper, .semi-notification-wrapper, [class*="toast"], [class*="message"]'));
          for (const el of toasts) {
            const text = el.textContent?.trim() || '';
            if (!text) continue;
            if (text.includes('失败') || text.includes('错误') || text.includes('请修改') || text.includes('不符合')) {
              return { type: 'error', text: text.slice(0, 200) };
            }
            if (text.includes('成功') || text.includes('已保存') || text.includes('保存成功')) {
              return { type: 'success', text: text.slice(0, 200) };
            }
          }
          return { type: null, text: '' };
        })()
      `);
      if (toastCheck?.type === 'error') {
        saveError = toastCheck.text;
        break;
      }
      if (toastCheck?.type === 'success') {
        if (Date.now() - saveStart > 10000) break;
      }

      const url = (await page.getCurrentUrl?.()) || '';
      const urlMatch = url.match(/[?&]draft_id=([^&]+)/);
      if (urlMatch) {
        draftId = urlMatch[1];
        break;
      }

      await sleep(1000);
    }

    if (saveError) {
      throw new CliError('PUBLISH_ERROR', `保存失败: ${saveError}`);
    }

    const link =
      draftUrl ||
      (draftId ? `https://music.douyin.com/console/complete-publish?draft_id=${draftId}` : null);

    return [
      {
        title: args.title,
        status: draftId ? 'saved' : 'submitted',
        message: link
          ? `已保存为草稿: ${link}`
          : '表单已提交并保存，未获取到草稿链接（请去汽水音乐后台查看）',
      },
    ];
  },
});

export { tagUploadsByFieldId, uploadFile, injectFileViaReactApi, setFieldValue, setFieldByLabel, clickRadioByLabel, selectMultiSelect, suppressDialogs, dismissAnyDialog, sleep };
