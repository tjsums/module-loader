/**
 * AngularJs 模块自动加载器
 * 根据模块定义文件，生成对应的模块文件
 * 定义文件模板见./test/module.json
 */

const acorn = require('acorn');
const {default: generate, defaultGenerator} = require('astring');
const traverse = require('traverse');

let parseModuleName = function (template_nodes, module_name) {
    /**
     * 处理模块名称
     * @type {*}
     */
    let node = template_nodes.filter(function (node) {
        return node
            && node.type
            && node.type === 'Literal'
            && node.value
            && node.value === '$module_name';
    })[0];
    node.value = module_name;
    node.raw = '"' + module_name + '"';
};

let parseModuleRequire = function (template_nodes, require_list) {
    /**
     * 处理模块Require依赖
     * @type {*}
     */
    let node = template_nodes.filter(function (node) {
        return node
            && node.type
            && node.type === 'VariableDeclarator'
            && node.id && node.id.name
            && node.id.name === '$require_function'
            && node.init
            && node.init.type
            && node.init.type === 'FunctionExpression';
    })[0];
    require_list.forEach(function (_req) {
        node.init.body.body.push({
            "type": "ExpressionStatement",
            "expression": {
                "type": "CallExpression",
                "callee": {
                    "type": "Identifier",
                    "name": "require"
                },
                "arguments": [{
                    "type": "Literal",
                    "value": _req,
                    "raw": '"' + _req + '"'
                }]
            }
        })
    })
};

let parseModuleTemplateRequire = function (template_nodes, template_list) {
    /**
     * 处理模块模板依赖
     * @type {*}
     */
    let node = template_nodes.filter(function (node) {
        return node
            && node.type
            && node.type === 'VariableDeclarator'
            && node.id
            && node.id.name
            && node.id.name === '$template_require_object';
    })[0];

    template_list.forEach(function (_tpl) {
        node.init.properties.push({
            "type": "Property",
            "key": {
                "type": "Literal",
                "value": _tpl,
                "raw": '"' + _tpl + '"'
            },
            "computed": false,
            "value": {
                "type": "CallExpression",
                "callee": {
                    "type": "Identifier",
                    "name": "require"
                },
                "arguments": [{
                    "type": "Literal",
                    "value": _tpl,
                    "raw": '"' + _tpl + '"'
                }]
            },
            "kind": "init",
            "method": false,
            "shorthand": false
        });
    })
};

let getTemplateProviderNode = function (tpl_name) {
    /**
     * 获取State定义中TemplateProvider的模板Function
     * @type {string}
     */
    let tpl = `var templateProvider=function(){
		return new Promise(resolve=>{
			loader().then(function (_module) {
				resolve(_module['${tpl_name}']);
			})
		})
	}`;
    let tpl_asd = acorn.parse(tpl);
    return tpl_asd.body[0].declarations[0].init;
};

let getModuleResolveNode = function (app_name) {
    /**
     * 获取State定义中Resolve的模板Function
     * @type {string}
     */
    let tpl = `var moduleResolve=["$ocLazyLoad", function ($ocLazyLoad) {
		return new Promise(resolve=> {
			loader().then(function (_module) {	
				$ocLazyLoad.load({"name": "${app_name}"});
				resolve();
			})
		});
	}]`;
    let tpl_asd = acorn.parse(tpl);
    return tpl_asd.body[0].declarations[0].init;
};


let parseModuleStates = function (template_nodes, state_list, app_name) {
    /**
     * 处理模板State
     * @type {*}
     */
    let node = template_nodes.filter(function (node) {
        return node
            && node.type
            && node.type === 'VariableDeclarator'
            && node.id
            && node.id.name
            && node.id.name === '$states_function'
            && node.init
            && node.init.type
            && node.init.type === 'FunctionExpression';
    });

    let states_function = node[0].init.body.body;
    state_list.forEach(function (_state) {
        let _template_url_node = _state.properties.filter(function (_p) {
            return _p.key.value === 'templateUrl';
        });
        if (_template_url_node.length > 0) {
            _template_url_node[0].key.value = 'templateUrlBak';
            _template_url_node[0].key.raw = '"templateUrlBak"';
            _state.properties.push({
                "type": "Property",
                "kind": "init",
                "key": {
                    "raw": '"templateProvider"',
                    "type": "Literal",
                    "value": "templateProvider"
                },
                "computed": false,
                "method": false,
                "shorthand": false,
                "value": getTemplateProviderNode(_template_url_node[0].value.value)
            });
        }


        let _module_resolve = {
            "type": "Property",
            "kind": "init",
            "key": {
                "raw": '"moduleLoader"',
                "type": "Literal",
                "value": "moduleLoader"
            },
            "computed": false,
            "method": false,
            "shorthand": false,
            "value": getModuleResolveNode(app_name)
        };

        let _resolve_node = _state.properties.filter(function (_p) {
            return _p.key.value === 'resolve';
        });

        if (_resolve_node.length > 0) {
            _resolve_node.value.properties.push(_module_resolve);
        } else {
            _state.properties.push({
                "type": "Property",
                "kind": "init",
                "key": {
                    "raw": '"resolve"',
                    "type": "Literal",
                    "value": "resolve"
                },
                "computed": false,
                "method": false,
                "shorthand": false,
                "value": {
                    "type": "ObjectExpression",
                    "properties": [_module_resolve]
                }
            })
        }

        let _state_name = _state.properties.filter(function (_p) {
            return _p.key.value = "name"
        });
        if (_state_name.length > 0) {
            _state_name = _state_name[0].value.value
        }
        states_function.push({
            type: 'ExpressionStatement',
            expression: {
                type: "CallExpression",
                callee: {
                    "type": "MemberExpression",
                    "computed": false,
                    "object": {
                        "type": "Identifier",
                        "name": "$stateProvider"
                    },
                    "property": {
                        "type": "Identifier",
                        "name": "state"
                    }
                },
                arguments: [{
                    "type": "Literal",
                    "value": _state_name,
                    "raw": "'" + _state_name + "'"
                },
                    _state]
            }
        })

    })

};


/**
 * 输出模板
 * @type {string}
 */
let output_template = `
'use strict';

var loader = function () {
    return new Promise(resolve => {    
		var $require_function=function(){};
        $require_function();

        var $template_require_object={};
        resolve($template_require_object);
    });
};

var $states_function=function ($stateProvider) {
};

export default $states_function;
`;


/**
 * Lazy加载输出模板
 * @type {string}
 */
let output_template_lazy = `
'use strict';

var loader = function () {
    return new Promise(resolve => {
        require.ensure([], function () {
			var $require_function=function(){};
            $require_function();

            var $template_require_object={};
            resolve($template_require_object);
        }, "$module_name");
    });
};

var $states_function=function ($stateProvider) {
};

export default $states_function;
`;


module.exports = function (source) {
    /**
     * 输出主函数
     * @type {Object}
     */
    let meta_json = eval("(" + source + ")");

    let meta = acorn.parse('var meta=' + source, {
        locations: false
    });

    let meta_nodes = traverse(meta).nodes();

    let template = acorn.parse(
        (meta_json && meta_json.loader && meta_json.loader === 'lazy') ? output_template_lazy : output_template,
        {
            ecmaVersion: 6,
            sourceType: 'module',
            locations: false
        }
    );
    let template_nodes = traverse(template).nodes();

    let module_name = meta_json.name;
    parseModuleName(template_nodes, module_name);

    let module_require_list = meta_json.requires || [];
    module_require_list = module_require_list.concat(meta_json.states.filter(state => state.require).map(state => state.require));
    parseModuleRequire(template_nodes, module_require_list);

    let module_template_list = meta_json.states.filter(state => state.templateUrl).map(state => state.templateUrl);
    parseModuleTemplateRequire(template_nodes, module_template_list);


    let app_name = meta_json.app_name;
    let states_nodes = meta_nodes.filter(function (node) {
        return node
            && node.type
            && node.type === 'Property'
            && node.key
            && node.key.type
            && node.key.type === 'Literal'
            && node.key.value
            && node.key.value === 'states';
    });
    parseModuleStates(template_nodes, states_nodes[0].value.elements, app_name);

    return generate(template, {
        indent: '   ',
        lineEnd: '\n'
    });
};