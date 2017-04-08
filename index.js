/**
 * AngularJs 模块自动加载器
 * 根据模块定义文件，生成对应的模块文件
 * 支持参数，用于：
 * 1、模板替换
 * 2、target参数用于require和state过滤
 * 定义文件模板见./test/module.json
 */

const acorn = require('acorn');
const {default: generate, defaultGenerator} = require('astring');
const traverse = require('traverse');
const loaderUtils = require('loader-utils');

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
    });
    if (node.length > 0) {
        node[0].value = module_name;
        node[0].raw = '"' + module_name + '"';
    }

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
        var $q=angular.injector(['ng']).get('$q');
        var defer= $q.defer();
        loader($q).then(function (_module) {
				defer.resolve(_module['${tpl_name}']);
		})
		return defer.promise
	}`;
    let tpl_asd = acorn.parse(tpl);
    return tpl_asd.body[0].declarations[0].init;
};

let getModuleResolveNode = function (app_name) {
    /**
     * 获取State定义中Resolve的模板Function
     * @type {string}
     */
    let tpl = `var moduleResolve=["$ocLazyLoad","$q", function ($ocLazyLoad,$q) {
        var defer=$q.defer();
        loader($q).then(function (_module) {	
				$ocLazyLoad.load({"name": "${app_name}"});
				defer.resolve();
		});
		return defer.promise;
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

var loader = function ($q) {
    var defer=$q.defer();
        
    var $require_function=function(){};
    $require_function();

    var $template_require_object={};
    defer.resolve($template_require_object);
    
    return defer.promise;
};

var $states_function=function ($stateProvider) {
};

module.exports = $states_function;
`;


/**
 * Lazy加载输出模板
 * @type {string}
 */
let output_template_lazy = `
'use strict';

var loader = function ($q) {
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

module.exports = $states_function;
`;


module.exports = function (source) {
    /**
     * 输出主函数
     * @type {Object}
     */

    this.cacheable && this.cacheable();

    const options = Object.assign(
        {
            target: null
        },
        loaderUtils.getOptions(this)
    );
    for(let key in options){
        let reg=new RegExp("\\$\\{"+key+"\\}","g");
        if(options.hasOwnProperty(key)){
            (source=source.replace(reg,options[key]||''));
        }
    }

    let meta_json = eval("(" + source + ")");

    let meta = acorn.parse('var meta=' + source, {
        locations: false
    });

    let meta_nodes = traverse(meta).nodes();

    let template = acorn.parse(
        (meta_json && meta_json['loader'] && meta_json['loader'] === 'normal') ? output_template : output_template_lazy,
        {
            ecmaVersion: 6,
            sourceType: 'module',
            locations: false
        }
    );
    let template_nodes = traverse(template).nodes();

    let module_name = meta_json.name;
    if(options.target){
        module_name=module_name+'.'+options.target;
    }
    parseModuleName(template_nodes, module_name);

    let module_require_list = meta_json['requires'] || [];
    if (options.target) {
        module_require_list = module_require_list.concat(meta_json['requires_' + options.target] || [])
    }

    let target_states=meta_json['states'].filter(function(_state){
        return (!options['target']||!_state['target']||_state['target']===options['target']||_state['target'].indexOf(options['target'])>-1)
    });

    module_require_list = module_require_list.concat(target_states.filter(state=>state['require']).map(state => state['require']));

    parseModuleRequire(template_nodes, module_require_list);

    let module_template_list = target_states.filter(state => state['templateUrl']).map(state => state['templateUrl']);
    parseModuleTemplateRequire(template_nodes, module_template_list);


    let app_name = meta_json['app_name'];
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
    let target_state_nodes=states_nodes[0].value.elements.filter(function(_state){
        if(!options.target){
            return true;
        }
        let target_node=_state.properties.filter(function (_p) {
            return _p.key&&_p.key.value&&_p.key.value==='target';
        });

        return (target_node.length<1||(target_node[0]&&target_node[0].value&&target_node[0].value.value&&target_node[0].value.value===options.target));
    });
    parseModuleStates(template_nodes, target_state_nodes, app_name);

    return generate(template, {
        indent: '   ',
        lineEnd: '\n'
    });
};