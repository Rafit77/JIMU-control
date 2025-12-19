import * as Blockly from 'blockly';
import 'blockly/blocks.js';
import en from 'blockly/msg/en.js';
import jsPkg from 'blockly/javascript.js';

const { javascriptGenerator } = jsPkg;

let idOptionsProvider = null;
export const setIdOptionsProvider = (fn) => {
  idOptionsProvider = typeof fn === 'function' ? fn : null;
};
const getIdOptions = (kind) => {
  try {
    const res = idOptionsProvider ? idOptionsProvider(kind) : null;
    const list = Array.isArray(res) ? res : [];
    if (list.length) return list.map((x) => [String(x), String(x)]);
  } catch (_) {
    // ignore
  }
  return [['(none)', '0']];
};

const getNumericIdOptions = (kind) =>
  getIdOptions(kind)
    .map(([, v]) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

const defineBlocksOnce = (() => {
  let done = false;
  return () => {
    if (done) return;
    done = true;

    Blockly.setLocale(en);

    // Ensure Variables "set" blocks have a default value shadow (=0).
    const patchDefaultValueShadow = (type) => {
      const def = Blockly?.Blocks?.[type];
      if (!def || typeof def.init !== 'function' || def.__jimuPatchedDefaultShadow) return;
      const origInit = def.init;
      def.init = function () {
        origInit.call(this);
        const input = this.getInput?.('VALUE');
        const conn = input?.connection;
        if (!conn) return;
        if (conn.targetConnection) return;
        if (typeof conn.getShadowState === 'function' && conn.getShadowState()) return;
        conn.setShadowState?.({ type: 'math_number', fields: { NUM: 0 } });
      };
      def.__jimuPatchedDefaultShadow = true;
    };
    patchDefaultValueShadow('variables_set');
    patchDefaultValueShadow('variables_set_dynamic');

    Blockly.common.defineBlocksWithJsonArray([
      {
        type: 'jimu_wait',
        message0: 'wait %1 ms',
        args0: [{ type: 'input_value', name: 'MS', check: 'Number' }],
        previousStatement: null,
        nextStatement: null,
        colour: 230,
        tooltip: 'Wait for a duration (cancellable via Stop).',
      },
      {
        type: 'jimu_wait_until',
        message0: 'wait until %1',
        args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
        previousStatement: null,
        nextStatement: null,
        colour: 230,
        tooltip: 'Wait until condition becomes true (polling, cancellable via Stop).',
      },
      {
        type: 'jimu_log',
        message0: 'log %1',
        args0: [{ type: 'input_value', name: 'TEXT' }],
        previousStatement: null,
        nextStatement: null,
        colour: 290,
        tooltip: 'Write to routine trace output and Logs tab.',
      },
      {
        type: 'jimu_emergency_stop',
        message0: 'emergency stop',
        previousStatement: null,
        nextStatement: null,
        colour: 0,
        tooltip: 'Immediate stop (best effort) + cancel routine.',
      },
      // NOTE: blocks with dynamic module ID dropdowns are defined below (not JSON).
      {
        type: 'jimu_get_slider',
        message0: 'get slider %1',
        args0: [{ type: 'field_input', name: 'NAME', text: 'slider1' }],
        output: 'Number',
        colour: 60,
        tooltip: 'Read a UI slider value by name (application input).',
      },
      {
        type: 'jimu_get_joystick',
        message0: 'get joystick %1 %2',
        args0: [
          { type: 'field_input', name: 'NAME', text: 'joy1' },
          {
            type: 'field_dropdown',
            name: 'AXIS',
            options: [
              ['x', 'x'],
              ['y', 'y'],
            ],
          },
        ],
        output: 'Number',
        colour: 60,
        tooltip: 'Read a UI joystick axis value by name (application input).',
      },
      {
        type: 'jimu_get_switch',
        message0: 'get switch %1',
        args0: [{ type: 'field_input', name: 'NAME', text: 'switch1' }],
        output: 'Boolean',
        colour: 60,
        tooltip: 'Read a UI switch value by name (application input).',
      },
      {
        type: 'jimu_select_action',
        message0: 'select action %1',
        args0: [{ type: 'field_input', name: 'NAME', text: 'wave' }],
        previousStatement: null,
        nextStatement: null,
        colour: 210,
        tooltip: 'Placeholder: select an Action for later playback integration.',
      },
      {
        type: 'jimu_indicator_color',
        message0: 'indicator %1 color %2',
        args0: [
          { type: 'field_input', name: 'NAME', text: 'status' },
          { type: 'field_colour', name: 'HEX', colour: '#00ff00' },
        ],
        previousStatement: null,
        nextStatement: null,
        colour: 110,
        tooltip: 'Controller: set a named indicator color (placeholder).',
      },
      {
        type: 'jimu_display_show',
        message0: 'display %1 show %2',
        args0: [
          { type: 'field_input', name: 'NAME', text: 'label1' },
          { type: 'input_value', name: 'VALUE' },
        ],
        previousStatement: null,
        nextStatement: null,
        colour: 110,
        tooltip: 'Controller: show a value on a named display widget (placeholder).',
      },
    ]);

    const makeIdDropdown = (kind) => new Blockly.FieldDropdown(() => getIdOptions(kind));
    const appendEyesMaskInput = (block) => {
      const ids = getNumericIdOptions('eyes');
      const row = block.appendDummyInput().appendField('eyes');
      if (!ids.length) {
        row.appendField(new Blockly.FieldLabelSerializable('(none)'));
        return;
      }
      ids.forEach((id) => {
        row.appendField(new Blockly.FieldCheckbox(id === ids[0] ? 'TRUE' : 'FALSE'), `EYE_${id}`);
        row.appendField(String(id));
        row.appendField(new Blockly.FieldLabelSerializable(' '));
      });
    };

    // Multi-servo positional move (mutator-based, like lists_create_with).
    Blockly.Blocks.jimu_set_servo_pos_container = {
      init() {
        this.appendDummyInput().appendField('servos');
        this.appendStatementInput('STACK');
        this.setColour(200);
        this.contextMenu = false;
      },
    };
    Blockly.Blocks.jimu_set_servo_pos_item = {
      init() {
        this.appendDummyInput().appendField('servo');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(200);
        this.contextMenu = false;
      },
    };

    Blockly.Blocks.jimu_set_servo_timed = {
      init() {
        this.setColour(200);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setTooltip(
          'Set one or more positional servos at once. Each servo has its own target degrees, and all share the same duration.',
        );
        this.itemCount_ = 1;
        this.appendDummyInput('TITLE').appendField('servo position');
        this.setMutator(new Blockly.icons.MutatorIcon(['jimu_set_servo_pos_item'], this));
        this.updateShape_();
      },
      updateWarning_() {
        const ids = [];
        for (let idx = 0; idx < this.itemCount_; idx += 1) ids.push(String(this.getFieldValue(`ID${idx}`) ?? ''));
        const clean = ids.filter((x) => x && x !== '0');
        const dup = clean.length !== new Set(clean).size;
        this.setWarningText(dup ? 'Duplicate servo IDs: each row should target a different servo.' : null);
      },
      onchange(e) {
        if (!this.workspace || this.workspace.isFlyout) return;
        // Re-evaluate warning whenever ID fields change (or after mutator changes).
        if (!e || e.blockId !== this.id) {
          this.updateWarning_();
          return;
        }
        if (e.type === Blockly.Events.BLOCK_CHANGE && typeof e.name === 'string' && e.name.startsWith('ID')) {
          this.updateWarning_();
          return;
        }
        if (e.type === Blockly.Events.BLOCK_CHANGE && e.element === 'mutation') {
          this.updateWarning_();
          return;
        }
      },
      saveExtraState() {
        return { itemCount: this.itemCount_ };
      },
      loadExtraState(state) {
        const n = Number(state?.itemCount ?? 1);
        this.itemCount_ = Number.isFinite(n) && n > 0 ? Math.min(8, Math.floor(n)) : 1;
        this.updateShape_();
      },
      decompose(workspace) {
        const container = workspace.newBlock('jimu_set_servo_pos_container');
        container.initSvg();
        let conn = container.getInput('STACK').connection;
        for (let i = 0; i < this.itemCount_; i += 1) {
          const item = workspace.newBlock('jimu_set_servo_pos_item');
          item.initSvg();
          conn.connect(item.previousConnection);
          conn = item.nextConnection;
        }
        return container;
      },
      compose(container) {
        const valueConnections = [];
        let item = container.getInputTargetBlock('STACK');
        while (item) {
          valueConnections.push(item.valueConnection_);
          item = item.nextConnection && item.nextConnection.targetBlock();
        }

        const oldIds = [];
        for (let i = 0; i < this.itemCount_; i += 1) oldIds.push(this.getFieldValue(`ID${i}`));

        this.itemCount_ = Math.max(1, Math.min(8, valueConnections.length || 1));
        this.updateShape_();

        for (let i = 0; i < this.itemCount_; i += 1) {
          if (oldIds[i] != null && this.getField(`ID${i}`)) this.setFieldValue(oldIds[i], `ID${i}`);
          if (valueConnections[i]) valueConnections[i].reconnect(this, `DEG${i}`);
        }
      },
      saveConnections(container) {
        let item = container.getInputTargetBlock('STACK');
        let i = 0;
        while (item) {
          const input = this.getInput(`DEG${i}`);
          item.valueConnection_ = input && input.connection.targetConnection;
          i += 1;
          item = item.nextConnection && item.nextConnection.targetBlock();
        }
      },
      updateShape_() {
        // Remove existing servo inputs
        let i = 0;
        while (this.getInput(`DEG${i}`)) {
          this.removeInput(`DEG${i}`);
          i += 1;
        }
        if (this.getInput('DUR')) this.removeInput('DUR');

        const makeDistinctIdValidator = (idx, field) => {
          return (newValue) => {
            const all = getNumericIdOptions('servoPosition');
            if (!all.length) return newValue;

            const next = String(newValue ?? '');
            if (!next || next === '0') return next;

            // Count how many times this value appears with the attempted change applied.
            let countSame = 0;
            const used = new Set();
            for (let j = 0; j < this.itemCount_; j += 1) {
              const v = j === idx ? next : String(this.getFieldValue(`ID${j}`) ?? '');
              if (v === next) countSame += 1;
              if (v && v !== '0') used.add(v);
            }
            if (countSame <= 1) return next;

            // Duplicate: pick the first unused ID from the available list.
            for (const id of all) {
              const s = String(id);
              if (!used.has(s)) return s;
            }

            // No alternatives: keep previous value.
            return String(field.getValue() ?? next);
          };
        };

        for (let idx = 0; idx < this.itemCount_; idx += 1) {
          const input = this.appendValueInput(`DEG${idx}`)
            .setCheck('Number')
            .appendField(makeIdDropdown('servoPosition'), `ID${idx}`)
            .appendField('<--- (deg)');
          input.connection?.setShadowState({ type: 'math_number', fields: { NUM: 0 } });
          const idField = this.getField(`ID${idx}`);
          if (idField && typeof idField.setValidator === 'function') {
            idField.setValidator(makeDistinctIdValidator(idx, idField));
          }
        }
        const durInput = this.appendValueInput('DUR').setCheck('Number').appendField('duration ms');
        durInput.connection?.setShadowState({ type: 'math_number', fields: { NUM: 80 } });
        this.updateWarning_();
      },
    };

    Blockly.Blocks.jimu_rotate_motor_container = {
      init() {
        this.appendDummyInput().appendField('motors');
        this.appendStatementInput('STACK');
        this.setColour(200);
        this.contextMenu = false;
      },
    };
    Blockly.Blocks.jimu_rotate_motor_item = {
      init() {
        this.appendDummyInput().appendField('motor');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(200);
        this.contextMenu = false;
      },
    };

    Blockly.Blocks.jimu_rotate_motor = {
      init() {
        this.setColour(200);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setTooltip('Rotate one or more motors. Each motor has its own speed. Negative speed reverses direction.');
        this.itemCount_ = 1;
        this.appendDummyInput('TITLE').appendField('rotate motor , duration');
        this.setMutator(new Blockly.icons.MutatorIcon(['jimu_rotate_motor_item'], this));
        this.updateShape_();
      },
      saveExtraState() {
        return { itemCount: this.itemCount_ };
      },
      loadExtraState(state) {
        const n = Number(state?.itemCount ?? 1);
        this.itemCount_ = Number.isFinite(n) && n > 0 ? Math.min(8, Math.floor(n)) : 1;
        this.updateShape_();
      },
      decompose(workspace) {
        const container = workspace.newBlock('jimu_rotate_motor_container');
        container.initSvg();
        let conn = container.getInput('STACK').connection;
        for (let i = 0; i < this.itemCount_; i += 1) {
          const item = workspace.newBlock('jimu_rotate_motor_item');
          item.initSvg();
          conn.connect(item.previousConnection);
          conn = item.nextConnection;
        }
        return container;
      },
      compose(container) {
        const valueConnections = [];
        let item = container.getInputTargetBlock('STACK');
        while (item) {
          valueConnections.push(item.valueConnection_);
          item = item.nextConnection && item.nextConnection.targetBlock();
        }

        const oldIds = [];
        for (let i = 0; i < this.itemCount_; i += 1) oldIds.push(this.getFieldValue(`ID${i}`));

        this.itemCount_ = Math.max(1, Math.min(8, valueConnections.length || 1));
        this.updateShape_();

        for (let i = 0; i < this.itemCount_; i += 1) {
          if (oldIds[i] != null && this.getField(`ID${i}`)) this.setFieldValue(oldIds[i], `ID${i}`);
          if (valueConnections[i]) valueConnections[i].reconnect(this, `SPD${i}`);
        }
      },
      saveConnections(container) {
        let item = container.getInputTargetBlock('STACK');
        let i = 0;
        while (item) {
          const input = this.getInput(`SPD${i}`);
          item.valueConnection_ = input && input.connection.targetConnection;
          i += 1;
          item = item.nextConnection && item.nextConnection.targetBlock();
        }
      },
      updateWarning_() {
        const ids = [];
        for (let idx = 0; idx < this.itemCount_; idx += 1) ids.push(String(this.getFieldValue(`ID${idx}`) ?? ''));
        const clean = ids.filter((x) => x && x !== '0');
        const dup = clean.length !== new Set(clean).size;
        this.setWarningText(dup ? 'Duplicate motor IDs: each row should target a different motor.' : null);
      },
      onchange(e) {
        if (!this.workspace || this.workspace.isFlyout) return;
        if (!e || e.blockId !== this.id) {
          this.updateWarning_();
          return;
        }
        if (e.type === Blockly.Events.BLOCK_CHANGE && typeof e.name === 'string' && e.name.startsWith('ID')) {
          this.updateWarning_();
          return;
        }
        if (e.type === Blockly.Events.BLOCK_CHANGE && e.element === 'mutation') {
          this.updateWarning_();
          return;
        }
      },
      updateShape_() {
        let i = 0;
        while (this.getInput(`SPD${i}`)) {
          this.removeInput(`SPD${i}`);
          i += 1;
        }
        if (this.getInput('DUR')) this.removeInput('DUR');

        const makeDistinctIdValidator = (idx, field) => {
          return (newValue) => {
            const all = getNumericIdOptions('motor');
            if (!all.length) return newValue;
            const next = String(newValue ?? '');
            if (!next || next === '0') return next;

            let countSame = 0;
            const used = new Set();
            for (let j = 0; j < this.itemCount_; j += 1) {
              const v = j === idx ? next : String(this.getFieldValue(`ID${j}`) ?? '');
              if (v === next) countSame += 1;
              if (v && v !== '0') used.add(v);
            }
            if (countSame <= 1) return next;

            for (const id of all) {
              const s = String(id);
              if (!used.has(s)) return s;
            }
            return String(field.getValue() ?? next);
          };
        };

        for (let idx = 0; idx < this.itemCount_; idx += 1) {
          const input = this.appendValueInput(`SPD${idx}`)
            .setCheck('Number')
            .appendField(makeIdDropdown('motor'), `ID${idx}`)
            .appendField('<--- (speed)');
          input.connection?.setShadowState({ type: 'math_number', fields: { NUM: 0 } });
          const idField = this.getField(`ID${idx}`);
          if (idField && typeof idField.setValidator === 'function') {
            idField.setValidator(makeDistinctIdValidator(idx, idField));
          }
        }
        const durInput = this.appendValueInput('DUR').setCheck('Number').appendField('duration ms');
        durInput.connection?.setShadowState({ type: 'math_number', fields: { NUM: 5000 } });
        this.updateWarning_();
      },
    };

    Blockly.Blocks.jimu_stop_motor = {
      init() {
        this.setColour(200);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setTooltip('Stop one or more motors (best effort).');
        this.itemCount_ = 1;
        this.appendDummyInput('TITLE').appendField('stop motor');
        this.setMutator(new Blockly.icons.MutatorIcon(['jimu_stop_motor_item'], this));
        this.updateShape_();
      },
      saveExtraState() {
        return { itemCount: this.itemCount_ };
      },
      loadExtraState(state) {
        const n = Number(state?.itemCount ?? 1);
        this.itemCount_ = Number.isFinite(n) && n > 0 ? Math.min(8, Math.floor(n)) : 1;
        this.updateShape_();
      },
      decompose(workspace) {
        const container = workspace.newBlock('jimu_stop_motor_container');
        container.initSvg();
        let conn = container.getInput('STACK').connection;
        for (let i = 0; i < this.itemCount_; i += 1) {
          const item = workspace.newBlock('jimu_stop_motor_item');
          item.initSvg();
          conn.connect(item.previousConnection);
          conn = item.nextConnection;
        }
        return container;
      },
      compose(container) {
        const oldIds = [];
        for (let i = 0; i < this.itemCount_; i += 1) oldIds.push(this.getFieldValue(`ID${i}`));

        const items = [];
        let item = container.getInputTargetBlock('STACK');
        while (item) {
          items.push(item);
          item = item.nextConnection && item.nextConnection.targetBlock();
        }

        this.itemCount_ = Math.max(1, Math.min(8, items.length || 1));
        this.updateShape_();

        for (let i = 0; i < this.itemCount_; i += 1) {
          if (oldIds[i] != null && this.getField(`ID${i}`)) this.setFieldValue(oldIds[i], `ID${i}`);
        }
      },
      updateWarning_() {
        const ids = [];
        for (let idx = 0; idx < this.itemCount_; idx += 1) ids.push(String(this.getFieldValue(`ID${idx}`) ?? ''));
        const clean = ids.filter((x) => x && x !== '0');
        const dup = clean.length !== new Set(clean).size;
        this.setWarningText(dup ? 'Duplicate motor IDs: each row should target a different motor.' : null);
      },
      onchange(e) {
        if (!this.workspace || this.workspace.isFlyout) return;
        if (!e || e.blockId !== this.id) {
          this.updateWarning_();
          return;
        }
        if (e.type === Blockly.Events.BLOCK_CHANGE && typeof e.name === 'string' && e.name.startsWith('ID')) {
          this.updateWarning_();
          return;
        }
        if (e.type === Blockly.Events.BLOCK_CHANGE && e.element === 'mutation') {
          this.updateWarning_();
          return;
        }
      },
      updateShape_() {
        let i = 0;
        while (this.getInput(`ROW${i}`)) {
          this.removeInput(`ROW${i}`);
          i += 1;
        }

        const makeDistinctIdValidator = (idx, field) => {
          return (newValue) => {
            const all = getNumericIdOptions('motor');
            if (!all.length) return newValue;
            const next = String(newValue ?? '');
            if (!next || next === '0') return next;

            let countSame = 0;
            const used = new Set();
            for (let j = 0; j < this.itemCount_; j += 1) {
              const v = j === idx ? next : String(this.getFieldValue(`ID${j}`) ?? '');
              if (v === next) countSame += 1;
              if (v && v !== '0') used.add(v);
            }
            if (countSame <= 1) return next;

            for (const id of all) {
              const s = String(id);
              if (!used.has(s)) return s;
            }
            return String(field.getValue() ?? next);
          };
        };

        for (let idx = 0; idx < this.itemCount_; idx += 1) {
          this.appendDummyInput(`ROW${idx}`).appendField(makeIdDropdown('motor'), `ID${idx}`);
          const idField = this.getField(`ID${idx}`);
          if (idField && typeof idField.setValidator === 'function') {
            idField.setValidator(makeDistinctIdValidator(idx, idField));
          }
        }
        this.updateWarning_();
      },
    };

    Blockly.Blocks.jimu_stop_motor_container = {
      init() {
        this.appendDummyInput().appendField('motors');
        this.appendStatementInput('STACK');
        this.setColour(200);
        this.contextMenu = false;
      },
    };
    Blockly.Blocks.jimu_stop_motor_item = {
      init() {
        this.appendDummyInput().appendField('motor');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(200);
        this.contextMenu = false;
      },
    };

    Blockly.Blocks.jimu_rotate_servo = {
      init() {
        this.setColour(200);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setTooltip(
          'Rotate one or more continuous-rotation servos (motor mode). Direction and speed are shared; IDs are sent in as few commands as possible.',
        );
        this.itemCount_ = 1;
        this.appendDummyInput('TITLE')
          .appendField('rotate servo')
          .appendField(
            new Blockly.FieldDropdown([
              ['cw', 'cw'],
              ['ccw', 'ccw'],
            ]),
            'DIR',
          );
        this.setMutator(new Blockly.icons.MutatorIcon(['jimu_rotate_servo_item'], this));
        this.updateShape_();
      },
      saveExtraState() {
        return { itemCount: this.itemCount_ };
      },
      loadExtraState(state) {
        const n = Number(state?.itemCount ?? 1);
        this.itemCount_ = Number.isFinite(n) && n > 0 ? Math.min(8, Math.floor(n)) : 1;
        this.updateShape_();
      },
      decompose(workspace) {
        const container = workspace.newBlock('jimu_rotate_servo_container');
        container.initSvg();
        let conn = container.getInput('STACK').connection;
        for (let i = 0; i < this.itemCount_; i += 1) {
          const item = workspace.newBlock('jimu_rotate_servo_item');
          item.initSvg();
          conn.connect(item.previousConnection);
          conn = item.nextConnection;
        }
        return container;
      },
      compose(container) {
        const oldIds = [];
        for (let i = 0; i < this.itemCount_; i += 1) oldIds.push(this.getFieldValue(`ID${i}`));

        const items = [];
        let item = container.getInputTargetBlock('STACK');
        while (item) {
          items.push(item);
          item = item.nextConnection && item.nextConnection.targetBlock();
        }

        this.itemCount_ = Math.max(1, Math.min(8, items.length || 1));
        this.updateShape_();

        for (let i = 0; i < this.itemCount_; i += 1) {
          if (oldIds[i] != null && this.getField(`ID${i}`)) this.setFieldValue(oldIds[i], `ID${i}`);
        }
      },
      updateWarning_() {
        const ids = [];
        for (let idx = 0; idx < this.itemCount_; idx += 1) ids.push(String(this.getFieldValue(`ID${idx}`) ?? ''));
        const clean = ids.filter((x) => x && x !== '0');
        const dup = clean.length !== new Set(clean).size;
        this.setWarningText(dup ? 'Duplicate servo IDs: each row should target a different servo.' : null);
      },
      onchange(e) {
        if (!this.workspace || this.workspace.isFlyout) return;
        if (!e || e.blockId !== this.id) {
          this.updateWarning_();
          return;
        }
        if (e.type === Blockly.Events.BLOCK_CHANGE && typeof e.name === 'string' && e.name.startsWith('ID')) {
          this.updateWarning_();
          return;
        }
        if (e.type === Blockly.Events.BLOCK_CHANGE && e.element === 'mutation') {
          this.updateWarning_();
          return;
        }
      },
      updateShape_() {
        // Remove existing ID inputs
        let i = 0;
        while (this.getInput(`ROW${i}`)) {
          this.removeInput(`ROW${i}`);
          i += 1;
        }
        if (this.getInput('SPEED')) this.removeInput('SPEED');

        const makeDistinctIdValidator = (idx, field) => {
          return (newValue) => {
            const all = getNumericIdOptions('servoRotate');
            if (!all.length) return newValue;
            const next = String(newValue ?? '');
            if (!next || next === '0') return next;

            let countSame = 0;
            const used = new Set();
            for (let j = 0; j < this.itemCount_; j += 1) {
              const v = j === idx ? next : String(this.getFieldValue(`ID${j}`) ?? '');
              if (v === next) countSame += 1;
              if (v && v !== '0') used.add(v);
            }
            if (countSame <= 1) return next;

            for (const id of all) {
              const s = String(id);
              if (!used.has(s)) return s;
            }
            return String(field.getValue() ?? next);
          };
        };

        for (let idx = 0; idx < this.itemCount_; idx += 1) {
          const row = this.appendDummyInput(`ROW${idx}`).appendField(makeIdDropdown('servoRotate'), `ID${idx}`);
          if (idx === 0) row.appendField('<');
          const idField = this.getField(`ID${idx}`);
          if (idField && typeof idField.setValidator === 'function') {
            idField.setValidator(makeDistinctIdValidator(idx, idField));
          }
        }

        const speedInput = this.appendValueInput('SPEED').setCheck('Number').appendField('speed');
        speedInput.connection?.setShadowState({ type: 'math_number', fields: { NUM: 0 } });
        this.updateWarning_();
      },
    };

    Blockly.Blocks.jimu_rotate_servo_container = {
      init() {
        this.appendDummyInput().appendField('servos');
        this.appendStatementInput('STACK');
        this.setColour(200);
        this.contextMenu = false;
      },
    };
    Blockly.Blocks.jimu_rotate_servo_item = {
      init() {
        this.appendDummyInput().appendField('servo');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(200);
        this.contextMenu = false;
      },
    };

    Blockly.Blocks.jimu_stop_servo = {
      init() {
        this.setColour(200);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setTooltip('Stop one or more continuous-rotation servos (best effort).');
        this.itemCount_ = 1;
        this.appendDummyInput('TITLE').appendField('stop servo');
        this.setMutator(new Blockly.icons.MutatorIcon(['jimu_stop_servo_item'], this));
        this.updateShape_();
      },
      saveExtraState() {
        return { itemCount: this.itemCount_ };
      },
      loadExtraState(state) {
        const n = Number(state?.itemCount ?? 1);
        this.itemCount_ = Number.isFinite(n) && n > 0 ? Math.min(8, Math.floor(n)) : 1;
        this.updateShape_();
      },
      decompose(workspace) {
        const container = workspace.newBlock('jimu_stop_servo_container');
        container.initSvg();
        let conn = container.getInput('STACK').connection;
        for (let i = 0; i < this.itemCount_; i += 1) {
          const item = workspace.newBlock('jimu_stop_servo_item');
          item.initSvg();
          conn.connect(item.previousConnection);
          conn = item.nextConnection;
        }
        return container;
      },
      compose(container) {
        const oldIds = [];
        for (let i = 0; i < this.itemCount_; i += 1) oldIds.push(this.getFieldValue(`ID${i}`));

        const items = [];
        let item = container.getInputTargetBlock('STACK');
        while (item) {
          items.push(item);
          item = item.nextConnection && item.nextConnection.targetBlock();
        }

        this.itemCount_ = Math.max(1, Math.min(8, items.length || 1));
        this.updateShape_();

        for (let i = 0; i < this.itemCount_; i += 1) {
          if (oldIds[i] != null && this.getField(`ID${i}`)) this.setFieldValue(oldIds[i], `ID${i}`);
        }
      },
      updateWarning_() {
        const ids = [];
        for (let idx = 0; idx < this.itemCount_; idx += 1) ids.push(String(this.getFieldValue(`ID${idx}`) ?? ''));
        const clean = ids.filter((x) => x && x !== '0');
        const dup = clean.length !== new Set(clean).size;
        this.setWarningText(dup ? 'Duplicate servo IDs: each row should target a different servo.' : null);
      },
      onchange(e) {
        if (!this.workspace || this.workspace.isFlyout) return;
        if (!e || e.blockId !== this.id) {
          this.updateWarning_();
          return;
        }
        if (e.type === Blockly.Events.BLOCK_CHANGE && typeof e.name === 'string' && e.name.startsWith('ID')) {
          this.updateWarning_();
          return;
        }
        if (e.type === Blockly.Events.BLOCK_CHANGE && e.element === 'mutation') {
          this.updateWarning_();
          return;
        }
      },
      updateShape_() {
        let i = 0;
        while (this.getInput(`ROW${i}`)) {
          this.removeInput(`ROW${i}`);
          i += 1;
        }

        const makeDistinctIdValidator = (idx, field) => {
          return (newValue) => {
            const all = getNumericIdOptions('servoRotate');
            if (!all.length) return newValue;
            const next = String(newValue ?? '');
            if (!next || next === '0') return next;

            let countSame = 0;
            const used = new Set();
            for (let j = 0; j < this.itemCount_; j += 1) {
              const v = j === idx ? next : String(this.getFieldValue(`ID${j}`) ?? '');
              if (v === next) countSame += 1;
              if (v && v !== '0') used.add(v);
            }
            if (countSame <= 1) return next;

            for (const id of all) {
              const s = String(id);
              if (!used.has(s)) return s;
            }
            return String(field.getValue() ?? next);
          };
        };

        for (let idx = 0; idx < this.itemCount_; idx += 1) {
          this.appendDummyInput(`ROW${idx}`).appendField(makeIdDropdown('servoRotate'), `ID${idx}`);
          const idField = this.getField(`ID${idx}`);
          if (idField && typeof idField.setValidator === 'function') {
            idField.setValidator(makeDistinctIdValidator(idx, idField));
          }
        }
        this.updateWarning_();
      },
    };

    Blockly.Blocks.jimu_stop_servo_container = {
      init() {
        this.appendDummyInput().appendField('servos');
        this.appendStatementInput('STACK');
        this.setColour(200);
        this.contextMenu = false;
      },
    };
    Blockly.Blocks.jimu_stop_servo_item = {
      init() {
        this.appendDummyInput().appendField('servo');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(200);
        this.contextMenu = false;
      },
    };

    Blockly.Blocks.jimu_read_ir = {
      init() {
        this.appendDummyInput().appendField('read IR').appendField(makeIdDropdown('ir'), 'ID');
        this.setOutput(true, 'Number');
        this.setColour(40);
        this.setTooltip('Read IR sensor (raw value).');
      },
    };

    Blockly.Blocks.jimu_read_us = {
      init() {
        this.appendDummyInput().appendField('read Ultrasonic').appendField(makeIdDropdown('ultrasonic'), 'ID').appendField('(cm)');
        this.setOutput(true, 'Number');
        this.setColour(40);
        this.setTooltip('Read ultrasonic distance in cm (raw=0 => 301cm out of range).');
      },
    };

    Blockly.Blocks.jimu_read_servo = {
      init() {
        this.appendDummyInput().appendField('read servo').appendField(makeIdDropdown('servoAny'), 'ID').appendField('(deg)');
        this.setOutput(true, 'Number');
        this.setColour(40);
        this.setTooltip('Read current servo position in degrees.');
      },
    };

    Blockly.Blocks.jimu_battery_percent = {
      init() {
        this.appendDummyInput().appendField('battery level (%)');
        this.setOutput(true, 'Number');
        this.setColour(40);
        this.setTooltip('Battery level 0..100% using the same calibration as the UI battery icon.');
      },
    };

    Blockly.Blocks.jimu_battery_charging = {
      init() {
        this.appendDummyInput().appendField('battery charging?');
        this.setOutput(true, 'Boolean');
        this.setColour(40);
        this.setTooltip('True if the brick reports it is charging.');
      },
    };

    // Show blocks (dynamic module dropdowns)
    Blockly.Blocks.jimu_eye_color = {
      init() {
        this.appendDummyInput().appendField('eye LED');
        appendEyesMaskInput(this);
        this.appendDummyInput().appendField('color').appendField(new Blockly.FieldColour('#00ff00'), 'HEX');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(110);
        this.setTooltip('Set Eye LED to a solid color.');
      },
    };
    Blockly.Blocks.jimu_eye_color_duration = {
      init() {
        this.appendDummyInput().appendField('eye LED');
        appendEyesMaskInput(this);
        this.appendDummyInput().appendField('color').appendField(new Blockly.FieldColour('#00ff00'), 'HEX');
        this.appendValueInput('DUR').setCheck('Number').appendField('duration').appendField('ms');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(110);
        this.setTooltip('Set Eye LED to a solid color for a duration, then turn it off.');
      },
    };
    Blockly.Blocks.jimu_eye_scene = {
      init() {
        this.appendDummyInput().appendField('eye LED');
        appendEyesMaskInput(this);
        this.appendDummyInput()
          .appendField('color')
          .appendField(new Blockly.FieldColour('#00ff00'), 'HEX')
          .appendField('scene')
          .appendField(new Blockly.FieldNumber(1, 1, 15, 1), 'SCENE')
          .appendField('repeat')
          .appendField(new Blockly.FieldNumber(1, 1, 255, 1), 'REPEAT')
          .appendField('wait')
          .appendField(new Blockly.FieldCheckbox('TRUE'), 'WAIT');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(110);
        this.setTooltip('Play an eye animation scene. If wait=true, routine waits an estimated time (best effort).');
      },
    };

    // Segment labels are kept internally for mapping, but we don't show compass letters in the UI.
    const segLabels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const appendSegPickerRow = (block, labels) => {
      const row = block.appendDummyInput();
      row.appendField(new Blockly.FieldLabelSerializable('      '));
      labels.forEach((lbl) => {
        row.appendField(new Blockly.FieldColour('#000000'), `C_${lbl}`);
      });
    };

    Blockly.Blocks.jimu_eye_custom = {
      init() {
        this.appendDummyInput().appendField('eye LED');
        appendEyesMaskInput(this);
        this.appendDummyInput().appendField('custom');
        // Compass-like layout (3 rows)
        appendSegPickerRow(this, ['NW', 'N', 'NE']);
        // Add spacing so E looks on the right side (not touching W)
        const row = this.appendDummyInput();
        row.appendField(new Blockly.FieldLabelSerializable(' '));
        row.appendField(new Blockly.FieldColour('#000000'), 'C_W');
        row.appendField(new Blockly.FieldLabelSerializable('                   '));
        row.appendField(new Blockly.FieldColour('#000000'), 'C_E');
        appendSegPickerRow(this, ['SW', 'S', 'SE']);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(110);
        this.setTooltip('Set 8 eye segments with individual colors (compass order).');
      },
    };
    Blockly.Blocks.jimu_eye_custom_duration = {
      init() {
        this.appendDummyInput().appendField('eye LED');
        appendEyesMaskInput(this);
        this.appendDummyInput().appendField('custom');
        appendSegPickerRow(this, ['NW', 'N', 'NE']);
        const row = this.appendDummyInput();
        row.appendField(new Blockly.FieldLabelSerializable(' '));
        row.appendField(new Blockly.FieldColour('#000000'), 'C_W');
        row.appendField(new Blockly.FieldLabelSerializable('                    '));
        row.appendField(new Blockly.FieldColour('#000000'), 'C_E');
        appendSegPickerRow(this, ['SW', 'S', 'SE']);
        this.appendValueInput('DUR').setCheck('Number').appendField('duration').appendField('ms');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(110);
        this.setTooltip('Set 8 eye segments with individual colors for a duration, then turn off.');
      },
    };
    Blockly.Blocks.jimu_eye_off = {
      init() {
        this.appendDummyInput().appendField('eye LED');
        appendEyesMaskInput(this);
        this.appendDummyInput().appendField('off');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(110);
        this.setTooltip('Turn off an eye LED.');
      },
    };
    Blockly.Blocks.jimu_us_led_color = {
      init() {
        this.appendDummyInput()
          .appendField('ultrasonic LED')
          .appendField(makeIdDropdown('ultrasonic'), 'ID')
          .appendField('color')
          .appendField(new Blockly.FieldColour('#00ff00'), 'HEX');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(110);
        this.setTooltip('Set ultrasonic LED to a solid color.');
      },
    };
    Blockly.Blocks.jimu_us_led_off = {
      init() {
        this.appendDummyInput().appendField('ultrasonic LED').appendField(makeIdDropdown('ultrasonic'), 'ID').appendField('off');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(110);
        this.setTooltip('Turn off ultrasonic LED.');
      },
    };

    javascriptGenerator.forBlock.jimu_wait = (block) => {
      const ms = javascriptGenerator.valueToCode(block, 'MS', javascriptGenerator.ORDER_NONE) || '0';
      return `await api.wait(${ms});\n`;
    };
    javascriptGenerator.forBlock.jimu_wait_until = (block) => {
      const cond = javascriptGenerator.valueToCode(block, 'COND', javascriptGenerator.ORDER_NONE) || 'false';
      return `while (!(${cond})) { await api.wait(50); }\n`;
    };
    javascriptGenerator.forBlock.jimu_log = (block) => {
      const t = javascriptGenerator.valueToCode(block, 'TEXT', javascriptGenerator.ORDER_NONE) || "''";
      return `api.log(${t});\n`;
    };
    // Variables: route through api so the Variables dialog can show live values.
    javascriptGenerator.forBlock.variables_get = (block) => {
      const field = block.getField('VAR');
      const name = typeof field?.getText === 'function' ? field.getText() : String(block.getFieldValue('VAR') || '');
      return [`api.varGet(${JSON.stringify(String(name || ''))})`, javascriptGenerator.ORDER_ATOMIC];
    };
    javascriptGenerator.forBlock.variables_set = (block) => {
      const field = block.getField('VAR');
      const name = typeof field?.getText === 'function' ? field.getText() : String(block.getFieldValue('VAR') || '');
      const value = javascriptGenerator.valueToCode(block, 'VALUE', javascriptGenerator.ORDER_ASSIGNMENT) || '0';
      return `api.varSet(${JSON.stringify(String(name || ''))}, ${value});\n`;
    };
    javascriptGenerator.forBlock.variables_get_dynamic = javascriptGenerator.forBlock.variables_get;
    javascriptGenerator.forBlock.variables_set_dynamic = javascriptGenerator.forBlock.variables_set;
    // "Change variable by" block: must also route through api (global variables).
    javascriptGenerator.forBlock.math_change = (block) => {
      const field = block.getField('VAR');
      const name = typeof field?.getText === 'function' ? field.getText() : String(block.getFieldValue('VAR') || '');
      const delta = javascriptGenerator.valueToCode(block, 'DELTA', javascriptGenerator.ORDER_ADDITION) || '0';
      const k = JSON.stringify(String(name || ''));
      return `{\n  const __v = api.varGet(${k});\n  api.varSet(${k}, (Number(__v ?? 0) + Number(${delta})));\n}\n`;
    };
    javascriptGenerator.forBlock.jimu_emergency_stop = () => 'await api.emergencyStop();\n';
    javascriptGenerator.forBlock.jimu_set_servo_timed = (block) => {
      const dur = javascriptGenerator.valueToCode(block, 'DUR', javascriptGenerator.ORDER_NONE) || '400';
      const parts = [];
      for (let i = 0; block.getInput(`DEG${i}`); i += 1) {
        const id = Number(block.getFieldValue(`ID${i}`) || 0);
        const deg = javascriptGenerator.valueToCode(block, `DEG${i}`, javascriptGenerator.ORDER_NONE) || '0';
        if (!id) continue;
        parts.push(`{ id: ${id}, deg: ${deg} }`);
      }
      const entries = `[${parts.join(', ')}]`;
      return `await api.setServoPositionsTimed(${entries}, ${dur});\n`;
    };
    javascriptGenerator.forBlock.jimu_rotate_motor = (block) => {
      const dur = javascriptGenerator.valueToCode(block, 'DUR', javascriptGenerator.ORDER_NONE) || '5000';
      const parts = [];
      for (let i = 0; block.getInput(`SPD${i}`); i += 1) {
        const id = Number(block.getFieldValue(`ID${i}`) || 0);
        const spd = javascriptGenerator.valueToCode(block, `SPD${i}`, javascriptGenerator.ORDER_NONE) || '0';
        if (!id) continue;
        parts.push(`{ id: ${id}, speed: ${spd} }`);
      }
      const entries = `[${parts.join(', ')}]`;
      return `await api.rotateMotorsTimed(${entries}, ${dur});\n`;
    };
    javascriptGenerator.forBlock.jimu_stop_motor = (block) => {
      const ids = [];
      for (let i = 0; block.getField(`ID${i}`); i += 1) {
        const id = Number(block.getFieldValue(`ID${i}`) || 0);
        if (id) ids.push(id);
      }
      return `await api.stopMotorsMulti(${JSON.stringify(ids)});\n`;
    };
    javascriptGenerator.forBlock.jimu_rotate_servo = (block) => {
      const dir = String(block.getFieldValue('DIR') || 'cw');
      const speed = javascriptGenerator.valueToCode(block, 'SPEED', javascriptGenerator.ORDER_NONE) || '0';
      const ids = [];
      for (let i = 0; block.getField(`ID${i}`); i += 1) {
        const id = Number(block.getFieldValue(`ID${i}`) || 0);
        if (id) ids.push(id);
      }
      return `await api.rotateServoMulti(${JSON.stringify(ids)}, ${JSON.stringify(dir)}, ${speed});\n`;
    };
    javascriptGenerator.forBlock.jimu_stop_servo = (block) => {
      const ids = [];
      for (let i = 0; block.getField(`ID${i}`); i += 1) {
        const id = Number(block.getFieldValue(`ID${i}`) || 0);
        if (id) ids.push(id);
      }
      return `await api.stopServosMulti(${JSON.stringify(ids)});\n`;
    };
    javascriptGenerator.forBlock.jimu_read_ir = (block) => {
      const id = Number(block.getFieldValue('ID') || 0);
      return [`await api.readIR(${id})`, javascriptGenerator.ORDER_NONE];
    };
    javascriptGenerator.forBlock.jimu_read_us = (block) => {
      const id = Number(block.getFieldValue('ID') || 0);
      return [`await api.readUltrasonicCm(${id})`, javascriptGenerator.ORDER_NONE];
    };
    javascriptGenerator.forBlock.jimu_read_servo = (block) => {
      const id = Number(block.getFieldValue('ID') || 0);
      return [`await api.readServoDeg(${id})`, javascriptGenerator.ORDER_NONE];
    };
    javascriptGenerator.forBlock.jimu_battery_percent = () => [`api.batteryPercent()`, javascriptGenerator.ORDER_NONE];
    javascriptGenerator.forBlock.jimu_battery_charging = () => [`api.batteryCharging()`, javascriptGenerator.ORDER_NONE];
    javascriptGenerator.forBlock.jimu_get_slider = (block) => {
      const name = String(block.getFieldValue('NAME') || '');
      return [`api.getSlider(${JSON.stringify(name)})`, javascriptGenerator.ORDER_NONE];
    };
    javascriptGenerator.forBlock.jimu_get_joystick = (block) => {
      const name = String(block.getFieldValue('NAME') || '');
      const axis = String(block.getFieldValue('AXIS') || 'x');
      return [`api.getJoystick(${JSON.stringify(name)}, ${JSON.stringify(axis)})`, javascriptGenerator.ORDER_NONE];
    };
    javascriptGenerator.forBlock.jimu_get_switch = (block) => {
      const name = String(block.getFieldValue('NAME') || '');
      return [`api.getSwitch(${JSON.stringify(name)})`, javascriptGenerator.ORDER_NONE];
    };
    javascriptGenerator.forBlock.jimu_select_action = (block) => {
      const name = String(block.getFieldValue('NAME') || '');
      return `api.selectAction(${JSON.stringify(name)});\n`;
    };
    javascriptGenerator.forBlock.jimu_eye_color = (block) => {
      const hex = String(block.getFieldValue('HEX') || '#000000');
      let eyesMask = 0;
      for (let id = 1; id <= 8; id += 1) {
        if (String(block.getFieldValue(`EYE_${id}`) || 'FALSE') === 'TRUE') eyesMask |= 1 << (id - 1);
      }
      return `await api.eyeColorMask(${eyesMask}, ${JSON.stringify(hex)});\n`;
    };
    javascriptGenerator.forBlock.jimu_eye_color_duration = (block) => {
      const hex = String(block.getFieldValue('HEX') || '#000000');
      const dur = javascriptGenerator.valueToCode(block, 'DUR', javascriptGenerator.ORDER_NONE) || '400';
      let eyesMask = 0;
      for (let id = 1; id <= 8; id += 1) {
        if (String(block.getFieldValue(`EYE_${id}`) || 'FALSE') === 'TRUE') eyesMask |= 1 << (id - 1);
      }
      return `await api.eyeColorForMask(${eyesMask}, ${JSON.stringify(hex)}, ${dur});\n`;
    };
    javascriptGenerator.forBlock.jimu_eye_scene = (block) => {
      const hex = String(block.getFieldValue('HEX') || '#000000');
      const scene = Number(block.getFieldValue('SCENE') || 1);
      const repeat = Number(block.getFieldValue('REPEAT') || 1);
      const wait = String(block.getFieldValue('WAIT') || 'FALSE') === 'TRUE';
      let eyesMask = 0;
      for (let id = 1; id <= 8; id += 1) {
        if (String(block.getFieldValue(`EYE_${id}`) || 'FALSE') === 'TRUE') eyesMask |= 1 << (id - 1);
      }
      return `await api.eyeSceneMask(${eyesMask}, ${scene}, ${repeat}, ${wait}, ${JSON.stringify(hex)});\n`;
    };
    javascriptGenerator.forBlock.jimu_eye_custom = (block) => {
      const colors = {};
      segLabels.forEach((lbl) => {
        colors[lbl] = String(block.getFieldValue(`C_${lbl}`) || '#000000');
      });
      let eyesMask = 0;
      for (let id = 1; id <= 8; id += 1) {
        if (String(block.getFieldValue(`EYE_${id}`) || 'FALSE') === 'TRUE') eyesMask |= 1 << (id - 1);
      }
      return `await api.eyeCustom8Mask(${eyesMask}, ${JSON.stringify(colors)});\n`;
    };
    javascriptGenerator.forBlock.jimu_eye_custom_duration = (block) => {
      const dur = javascriptGenerator.valueToCode(block, 'DUR', javascriptGenerator.ORDER_NONE) || '400';
      const colors = {};
      segLabels.forEach((lbl) => {
        colors[lbl] = String(block.getFieldValue(`C_${lbl}`) || '#000000');
      });
      let eyesMask = 0;
      for (let id = 1; id <= 8; id += 1) {
        if (String(block.getFieldValue(`EYE_${id}`) || 'FALSE') === 'TRUE') eyesMask |= 1 << (id - 1);
      }
      return `await api.eyeCustom8ForMask(${eyesMask}, ${JSON.stringify(colors)}, ${dur});\n`;
    };
    javascriptGenerator.forBlock.jimu_eye_off = (block) => {
      let eyesMask = 0;
      for (let id = 1; id <= 8; id += 1) {
        if (String(block.getFieldValue(`EYE_${id}`) || 'FALSE') === 'TRUE') eyesMask |= 1 << (id - 1);
      }
      return `await api.eyeOffMask(${eyesMask});\n`;
    };
    javascriptGenerator.forBlock.jimu_us_led_color = (block) => {
      const id = Number(block.getFieldValue('ID') || 1);
      const hex = String(block.getFieldValue('HEX') || '#000000');
      return `await api.usLedColor(${id}, ${JSON.stringify(hex)});\n`;
    };
    javascriptGenerator.forBlock.jimu_us_led_off = (block) => {
      const id = Number(block.getFieldValue('ID') || 1);
      return `await api.usLedOff(${id});\n`;
    };
    javascriptGenerator.forBlock.jimu_indicator_color = (block) => {
      const name = String(block.getFieldValue('NAME') || '');
      const hex = String(block.getFieldValue('HEX') || '#000000');
      return `api.indicatorColor(${JSON.stringify(name)}, ${JSON.stringify(hex)});\n`;
    };
    javascriptGenerator.forBlock.jimu_display_show = (block) => {
      const name = String(block.getFieldValue('NAME') || '');
      const value = javascriptGenerator.valueToCode(block, 'VALUE', javascriptGenerator.ORDER_NONE) || "''";
      return `api.displayShow(${JSON.stringify(name)}, ${value});\n`;
    };
  };
})();

export const getBlocklyToolbox = () => {
  defineBlocksOnce();

  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: 'Control',
        colour: 230,
        contents: [
          { kind: 'block', type: 'controls_if' },
          {
            kind: 'block',
            type: 'controls_repeat_ext',
            inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } } },
          },
          { kind: 'block', type: 'controls_whileUntil', inputs: { BOOL: { shadow: { type: 'logic_boolean', fields: { BOOL: 'FALSE' } } } } },
          { kind: 'block', type: 'jimu_wait', inputs: { MS: { shadow: { type: 'math_number', fields: { NUM: 500 } } } } },
          {
            kind: 'block',
            type: 'jimu_wait_until',
            inputs: { COND: { shadow: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } } },
          },
        ],
      },
      {
        kind: 'category',
        name: 'Math',
        categorystyle: 'math_category',
        contents: [
          { kind: 'block', type: 'math_number' },
          { kind: 'block', type: 'logic_boolean' },
          { kind: 'block', type: 'math_arithmetic' },
          {
            kind: 'block',
            type: 'math_random_int',
            inputs: {
              FROM: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
              TO: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
            },
          },
          {
            kind: 'block',
            type: 'math_constrain',
            inputs: {
              VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              LOW: { shadow: { type: 'math_number', fields: { NUM: -120 } } },
              HIGH: { shadow: { type: 'math_number', fields: { NUM: 120 } } },
            },
          },
          {
            kind: 'block',
            type: 'logic_compare',
            inputs: { A: { shadow: { type: 'math_number', fields: { NUM: 0 } } }, B: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
          },
          { kind: 'block', type: 'logic_operation' },
          { kind: 'block', type: 'logic_negate' },
        ],
      },
      // Note: use a custom callback that does NOT render Blockly's "Create variable" button
      // (Electron disables prompt()).
      { kind: 'category', name: 'Variables', custom: 'JIMU_VARIABLES', categorystyle: 'variable_category' },
      {
        kind: 'category',
        name: 'Sensors',
        colour: 40,
        contents: [
          { kind: 'block', type: 'jimu_read_ir' },
          { kind: 'block', type: 'jimu_read_us' },
          { kind: 'block', type: 'jimu_read_servo' },
          { kind: 'block', type: 'jimu_battery_percent' },
          { kind: 'block', type: 'jimu_battery_charging' },
          { kind: 'block', type: 'jimu_get_slider' },
          { kind: 'block', type: 'jimu_get_joystick' },
          { kind: 'block', type: 'jimu_get_switch' },
        ],
      },
      {
        kind: 'category',
        name: 'Movement',
        colour: 200,
        contents: [
          {
            kind: 'block',
            type: 'jimu_set_servo_timed',
            inputs: {
              DEG0: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              DUR: { shadow: { type: 'math_number', fields: { NUM: 80 } } },
            },
          },
          { kind: 'block', type: 'jimu_rotate_servo', inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 0 } } } } },
          { kind: 'block', type: 'jimu_stop_servo' },
          {
            kind: 'block',
            type: 'jimu_rotate_motor',
            inputs: {
              SPD0: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              DUR: { shadow: { type: 'math_number', fields: { NUM: 5000 } } },
            },
          },
          { kind: 'block', type: 'jimu_stop_motor' },
          { kind: 'block', type: 'jimu_select_action' },
          { kind: 'block', type: 'jimu_emergency_stop' },
        ],
      },
      {
        kind: 'category',
        name: 'Show',
        colour: 110,
        contents: [
          { kind: 'block', type: 'jimu_eye_color' },
          { kind: 'block', type: 'jimu_eye_color_duration', inputs: { DUR: { shadow: { type: 'math_number', fields: { NUM: 400 } } } } },
          { kind: 'block', type: 'jimu_eye_scene' },
          { kind: 'block', type: 'jimu_eye_custom' },
          { kind: 'block', type: 'jimu_eye_custom_duration', inputs: { DUR: { shadow: { type: 'math_number', fields: { NUM: 400 } } } } },
          { kind: 'block', type: 'jimu_eye_off' },
          { kind: 'block', type: 'jimu_us_led_color' },
          { kind: 'block', type: 'jimu_us_led_off' },
          { kind: 'block', type: 'jimu_indicator_color' },
          { kind: 'block', type: 'jimu_display_show' },
        ],
      },
      { kind: 'category', name: 'Debug', colour: 290, contents: [{ kind: 'block', type: 'jimu_log' }] },
    ],
  };
};

export const createWorkspace = (el, { initialXmlText } = {}) => {
  defineBlocksOnce();
  const workspace = Blockly.inject(el, {
    toolbox: getBlocklyToolbox(),
    trashcan: true,
    grid: { spacing: 20, length: 3, colour: '#ccc', snap: true },
    zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 2.0, minScale: 0.3 },
  });

  // Variables category without the built-in "Create variable" prompt button.
  // (The app has its own Variables dialog.)
  workspace.registerToolboxCategoryCallback?.('JIMU_VARIABLES', (ws) => {
    if (Blockly?.Variables?.flyoutCategoryBlocks) return Blockly.Variables.flyoutCategoryBlocks(ws);
    return [];
  });

  if (initialXmlText) {
    try {
      const dom = Blockly.Xml.textToDom(initialXmlText);
      Blockly.Xml.domToWorkspace(dom, workspace);
    } catch (_) {
      // ignore invalid xml
    }
  }

  return workspace;
};

export const workspaceToXmlText = (workspace) => {
  defineBlocksOnce();
  const dom = Blockly.Xml.workspaceToDom(workspace);
  return `${Blockly.Xml.domToText(dom)}\n`;
};

export const workspaceToAsyncJs = (workspace, { debug = false } = {}) => {
  defineBlocksOnce();
  const prevPrefix = javascriptGenerator.STATEMENT_PREFIX;
  const prevSuffix = javascriptGenerator.STATEMENT_SUFFIX;
  try {
    if (debug) {
      javascriptGenerator.STATEMENT_PREFIX = 'await api.__step(%1);\n';
      javascriptGenerator.STATEMENT_SUFFIX = null;
    }
    const code = javascriptGenerator.workspaceToCode(workspace);
    return `"use strict";\nreturn (async () => {\n${code}\n})();\n`;
  } finally {
    javascriptGenerator.STATEMENT_PREFIX = prevPrefix;
    javascriptGenerator.STATEMENT_SUFFIX = prevSuffix;
  }
};
