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

const defineBlocksOnce = (() => {
  let done = false;
  return () => {
    if (done) return;
    done = true;

    Blockly.setLocale(en);

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

    Blockly.Blocks.jimu_set_servo_timed = {
      init() {
        this.appendDummyInput()
          .appendField('set servo')
          .appendField(makeIdDropdown('servoPosition'), 'ID')
          .appendField('position');
        this.appendValueInput('DEG').setCheck('Number').appendField('deg');
        this.appendValueInput('DUR').setCheck('Number').appendField('duration').appendField('ms');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(160);
        this.setTooltip(
          'Set a positional servo; then wait for the duration (for timing). Degrees are clamped to calibration min/max.',
        );
      },
    };

    Blockly.Blocks.jimu_rotate_motor = {
      init() {
        this.appendDummyInput()
          .appendField('rotate motor')
          .appendField(makeIdDropdown('motor'), 'ID')
          .appendField(
            new Blockly.FieldDropdown([
              ['cw', 'cw'],
              ['ccw', 'ccw'],
            ]),
            'DIR',
          )
          .appendField('speed');
        this.appendValueInput('SPEED').setCheck('Number');
        this.appendValueInput('DUR').setCheck('Number').appendField('duration').appendField('ms');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(200);
        this.setTooltip('Rotate a motor for a duration (0..6000ms).');
      },
    };

    Blockly.Blocks.jimu_stop_motor = {
      init() {
        this.appendDummyInput().appendField('stop motor').appendField(makeIdDropdown('motor'), 'ID');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(200);
        this.setTooltip('Stop a motor (best effort).');
      },
    };

    Blockly.Blocks.jimu_rotate_servo = {
      init() {
        this.appendDummyInput()
          .appendField('rotate servo')
          .appendField(makeIdDropdown('servoRotate'), 'ID')
          .appendField(
            new Blockly.FieldDropdown([
              ['cw', 'cw'],
              ['ccw', 'ccw'],
            ]),
            'DIR',
          )
          .appendField('speed');
        this.appendValueInput('SPEED').setCheck('Number');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(200);
        this.setTooltip('Rotate a continuous-rotation servo (motor mode). Speed is clamped to calibration maxSpeed.');
      },
    };

    Blockly.Blocks.jimu_stop_servo = {
      init() {
        this.appendDummyInput().appendField('stop servo').appendField(makeIdDropdown('servoRotate'), 'ID');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(200);
        this.setTooltip('Stop a continuous-rotation servo (best effort).');
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
        this.appendDummyInput()
          .appendField('eye LED')
          .appendField(makeIdDropdown('eyes'), 'ID')
          .appendField('color')
          .appendField(new Blockly.FieldColour('#00ff00'), 'HEX');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(110);
        this.setTooltip('Set Eye LED to a solid color.');
      },
    };
    Blockly.Blocks.jimu_eye_color_duration = {
      init() {
        this.appendDummyInput()
          .appendField('eye LED')
          .appendField(makeIdDropdown('eyes'), 'ID')
          .appendField('color')
          .appendField(new Blockly.FieldColour('#00ff00'), 'HEX');
        this.appendValueInput('DUR').setCheck('Number').appendField('duration').appendField('ms');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(110);
        this.setTooltip('Set Eye LED to a solid color for a duration, then turn it off.');
      },
    };
    Blockly.Blocks.jimu_eye_scene = {
      init() {
        this.appendDummyInput()
          .appendField('eye LED')
          .appendField(makeIdDropdown('eyes'), 'ID')
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
        this.appendDummyInput().appendField('eye LED').appendField(makeIdDropdown('eyes'), 'ID').appendField('custom');
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
        this.appendDummyInput().appendField('eye LED').appendField(makeIdDropdown('eyes'), 'ID').appendField('custom');
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
        this.appendDummyInput().appendField('eye LED').appendField(makeIdDropdown('eyes'), 'ID').appendField('off');
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
    javascriptGenerator.forBlock.jimu_emergency_stop = () => 'await api.emergencyStop();\n';
    javascriptGenerator.forBlock.jimu_set_servo_timed = (block) => {
      const id = Number(block.getFieldValue('ID') || 0);
      const deg = javascriptGenerator.valueToCode(block, 'DEG', javascriptGenerator.ORDER_NONE) || '0';
      const dur = javascriptGenerator.valueToCode(block, 'DUR', javascriptGenerator.ORDER_NONE) || '400';
      return `await api.setServoPositionTimed(${id}, ${deg}, ${dur});\n`;
    };
    javascriptGenerator.forBlock.jimu_rotate_motor = (block) => {
      const id = Number(block.getFieldValue('ID') || 0);
      const dir = String(block.getFieldValue('DIR') || 'cw');
      const speed = javascriptGenerator.valueToCode(block, 'SPEED', javascriptGenerator.ORDER_NONE) || '0';
      const dur = javascriptGenerator.valueToCode(block, 'DUR', javascriptGenerator.ORDER_NONE) || '0';
      return `await api.rotateMotor(${id}, ${JSON.stringify(dir)}, ${speed}, ${dur});\n`;
    };
    javascriptGenerator.forBlock.jimu_stop_motor = (block) => {
      const id = Number(block.getFieldValue('ID') || 0);
      return `await api.stopMotor(${id});\n`;
    };
    javascriptGenerator.forBlock.jimu_rotate_servo = (block) => {
      const id = Number(block.getFieldValue('ID') || 0);
      const dir = String(block.getFieldValue('DIR') || 'cw');
      const speed = javascriptGenerator.valueToCode(block, 'SPEED', javascriptGenerator.ORDER_NONE) || '0';
      return `await api.rotateServo(${id}, ${JSON.stringify(dir)}, ${speed});\n`;
    };
    javascriptGenerator.forBlock.jimu_stop_servo = (block) => {
      const id = Number(block.getFieldValue('ID') || 0);
      return `await api.stopServo(${id});\n`;
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
      const id = Number(block.getFieldValue('ID') || 1);
      const hex = String(block.getFieldValue('HEX') || '#000000');
      return `await api.eyeColor(${id}, ${JSON.stringify(hex)});\n`;
    };
    javascriptGenerator.forBlock.jimu_eye_color_duration = (block) => {
      const id = Number(block.getFieldValue('ID') || 1);
      const hex = String(block.getFieldValue('HEX') || '#000000');
      const dur = javascriptGenerator.valueToCode(block, 'DUR', javascriptGenerator.ORDER_NONE) || '400';
      return `await api.eyeColorFor(${id}, ${JSON.stringify(hex)}, ${dur});\n`;
    };
    javascriptGenerator.forBlock.jimu_eye_scene = (block) => {
      const id = Number(block.getFieldValue('ID') || 1);
      const hex = String(block.getFieldValue('HEX') || '#000000');
      const scene = Number(block.getFieldValue('SCENE') || 1);
      const repeat = Number(block.getFieldValue('REPEAT') || 1);
      const wait = String(block.getFieldValue('WAIT') || 'FALSE') === 'TRUE';
      return `await api.eyeScene(${id}, ${scene}, ${repeat}, ${wait}, ${JSON.stringify(hex)});\n`;
    };
    javascriptGenerator.forBlock.jimu_eye_custom = (block) => {
      const id = Number(block.getFieldValue('ID') || 1);
      const colors = {};
      segLabels.forEach((lbl) => {
        colors[lbl] = String(block.getFieldValue(`C_${lbl}`) || '#000000');
      });
      return `await api.eyeCustom8(${id}, ${JSON.stringify(colors)});\n`;
    };
    javascriptGenerator.forBlock.jimu_eye_custom_duration = (block) => {
      const id = Number(block.getFieldValue('ID') || 1);
      const dur = javascriptGenerator.valueToCode(block, 'DUR', javascriptGenerator.ORDER_NONE) || '400';
      const colors = {};
      segLabels.forEach((lbl) => {
        colors[lbl] = String(block.getFieldValue(`C_${lbl}`) || '#000000');
      });
      return `await api.eyeCustom8For(${id}, ${JSON.stringify(colors)}, ${dur});\n`;
    };
    javascriptGenerator.forBlock.jimu_eye_off = (block) => {
      const id = Number(block.getFieldValue('ID') || 1);
      return `await api.eyeOff(${id});\n`;
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
      { kind: 'category', name: 'Variables', custom: 'VARIABLE', categorystyle: 'variable_category' },
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
              DEG: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
              DUR: { shadow: { type: 'math_number', fields: { NUM: 400 } } },
            },
          },
          { kind: 'block', type: 'jimu_rotate_servo', inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 500 } } } } },
          { kind: 'block', type: 'jimu_stop_servo' },
          {
            kind: 'block',
            type: 'jimu_rotate_motor',
            inputs: {
              SPEED: { shadow: { type: 'math_number', fields: { NUM: 80 } } },
              DUR: { shadow: { type: 'math_number', fields: { NUM: 500 } } },
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

export const workspaceToAsyncJs = (workspace) => {
  defineBlocksOnce();
  const code = javascriptGenerator.workspaceToCode(workspace);
  return `"use strict";\nreturn (async () => {\n${code}\n})();\n`;
};
