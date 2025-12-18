import * as Blockly from 'blockly';
import 'blockly/blocks.js';
import en from 'blockly/msg/en.js';
import jsPkg from 'blockly/javascript.js';

const { javascriptGenerator } = jsPkg;

const defineBlocksOnce = (() => {
  let done = false;
  return () => {
    if (done) return;
    done = true;

    Blockly.setLocale(en);

    Blockly.common.defineBlocksWithJsonArray([
      {
        type: 'jimu_connect',
        message0: 'connect',
        previousStatement: null,
        nextStatement: null,
        colour: 120,
        tooltip: 'Connect to the selected brick (from the Project/Model tab).',
      },
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
      {
        type: 'jimu_set_servo',
        message0: 'set servo %1 position %2 deg',
        args0: [
          { type: 'field_number', name: 'ID', value: 1, min: 1, max: 32, precision: 1 },
          { type: 'input_value', name: 'DEG', check: 'Number' },
        ],
        previousStatement: null,
        nextStatement: null,
        colour: 160,
        tooltip: 'Set a positional servo. Input is clamped to calibration min/max.',
      },
      {
        type: 'jimu_rotate_motor',
        message0: 'rotate motor %1 %2 speed %3 duration %4 ms',
        args0: [
          { type: 'field_number', name: 'ID', value: 1, min: 1, max: 8, precision: 1 },
          {
            type: 'field_dropdown',
            name: 'DIR',
            options: [
              ['cw', 'cw'],
              ['ccw', 'ccw'],
            ],
          },
          { type: 'input_value', name: 'SPEED', check: 'Number' },
          { type: 'input_value', name: 'DUR', check: 'Number' },
        ],
        previousStatement: null,
        nextStatement: null,
        colour: 200,
        tooltip: 'Rotate a motor for a duration (0..6000ms).',
      },
      {
        type: 'jimu_read_ir',
        message0: 'read IR %1',
        args0: [{ type: 'field_number', name: 'ID', value: 1, min: 1, max: 8, precision: 1 }],
        output: 'Number',
        colour: 20,
        tooltip: 'Read IR sensor (raw value).',
      },
      {
        type: 'jimu_read_us',
        message0: 'read Ultrasonic %1 (cm)',
        args0: [{ type: 'field_number', name: 'ID', value: 1, min: 1, max: 8, precision: 1 }],
        output: 'Number',
        colour: 40,
        tooltip: 'Read ultrasonic distance in cm (raw=0 => 301cm out of range).',
      },
    ]);

    javascriptGenerator.forBlock.jimu_connect = () => 'await api.connect();\n';
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
    javascriptGenerator.forBlock.jimu_set_servo = (block) => {
      const id = Number(block.getFieldValue('ID') || 1);
      const deg = javascriptGenerator.valueToCode(block, 'DEG', javascriptGenerator.ORDER_NONE) || '0';
      return `await api.setServoPosition(${id}, ${deg});\n`;
    };
    javascriptGenerator.forBlock.jimu_rotate_motor = (block) => {
      const id = Number(block.getFieldValue('ID') || 1);
      const dir = String(block.getFieldValue('DIR') || 'cw');
      const speed = javascriptGenerator.valueToCode(block, 'SPEED', javascriptGenerator.ORDER_NONE) || '0';
      const dur = javascriptGenerator.valueToCode(block, 'DUR', javascriptGenerator.ORDER_NONE) || '0';
      return `await api.rotateMotor(${id}, ${JSON.stringify(dir)}, ${speed}, ${dur});\n`;
    };
    javascriptGenerator.forBlock.jimu_read_ir = (block) => {
      const id = Number(block.getFieldValue('ID') || 1);
      return [`await api.readIR(${id})`, javascriptGenerator.ORDER_NONE];
    };
    javascriptGenerator.forBlock.jimu_read_us = (block) => {
      const id = Number(block.getFieldValue('ID') || 1);
      return [`await api.readUltrasonicCm(${id})`, javascriptGenerator.ORDER_NONE];
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
        name: 'Device',
        colour: 160,
        contents: [
          { kind: 'block', type: 'jimu_connect' },
          { kind: 'block', type: 'jimu_set_servo', inputs: { DEG: { shadow: { type: 'math_number', fields: { NUM: 0 } } } } },
          {
            kind: 'block',
            type: 'jimu_rotate_motor',
            inputs: {
              SPEED: { shadow: { type: 'math_number', fields: { NUM: 80 } } },
              DUR: { shadow: { type: 'math_number', fields: { NUM: 500 } } },
            },
          },
          { kind: 'block', type: 'jimu_read_ir' },
          { kind: 'block', type: 'jimu_read_us' },
          { kind: 'block', type: 'jimu_emergency_stop' },
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
