import Helper from "@ember/component/helper";
import { inject as service } from "@ember/service";
import { later, cancel } from "@ember/runloop";
import { get } from "@ember/object";

function hasPropertyNameInContext(prop, ctx) {
  if (typeof ctx !== 'object') {
    return false;
  }
  if (ctx === null) {
    return false;
  }
  return (prop in ctx);
}

// we need this because Ember.String.dasherize('XTestWrapper') -> xtest-wrapper, not x-test-wrapper
function dasherize(name = '') {
	const result = [];
	const nameSize = name.length;
	if (!nameSize) {
		return '';
	}
	result.push(name.charAt(0));
	for (let i = 1; i < nameSize; i++) {
		let char = name.charAt(i);
		if (char === char.toUpperCase()) {
			if (char !== '-') {
				if (result[result.length - 1] !== '-') {
					result.push('-');
				}
			}
		}
		result.push(char);
	}
	return result.join('').toLowerCase();
}

export default Helper.extend({
  hotLoader: service(),
  init() {
    this._super(...arguments);
    this.binded__rerenderOnTemplateUpdate = this.__rerenderOnTemplateUpdate.bind(
      this
    );
    const hotLoader = get(this, 'hotLoader');
    this.binded__willLiveReload = this.__willLiveReload.bind(this);
    hotLoader.registerWillHotReload(this.binded__rerenderOnTemplateUpdate);
    hotLoader.registerWillLiveReload(this.binded__willLiveReload);
  },
  __rerenderOnTemplateUpdate(path) {
    const hotLoader = get(this, 'hotLoader');
    if (hotLoader.isMatchingComponent(this.firstComputeName, path)) {
      hotLoader.forgetComponent(this.firstComputeName);
      cancel(this.timer);
      this.timer = later(() => {
        this.recompute();
      });
    }
  },
  __willLiveReload(event) {
    const hotLoader = get(this, 'hotLoader');
    if (hotLoader.isMatchingComponent(this.firstComputeName, event.modulePath)) {
      event.cancel = true;
      (this.possibleNames || []).forEach((computedName)=>{
        if (!event.components.includes(computedName)) {
          event.components.push(computedName);
        }
        hotLoader.clearRequirejs(computedName);
      });
    }
  },
  willDestroy() {
    this._super(...arguments);
    cancel(this.timer);
    const hotLoader = get(this, 'hotLoader');
    hotLoader.unregisterWillHotReload(
      this.binded__rerenderOnTemplateUpdate
    );
    hotLoader.unregisterWillLiveReload(this.binded__willLiveReload);
  },
  compute([name, context = {}, maybePropertyValue = undefined, astStringName = '']) {
    const hotLoader = get(this, 'hotLoader');
	const safeAstName = String(astStringName || '');
	const dasherizedName = dasherize(typeof name === 'string' ? name : '-unknown-');
	this.possibleNames = [ name, dasherizedName ].concat(hotLoader.scopedComponentNames(name, context));
	let renderComponentName = name;
	let isComponent = hotLoader.isComponent(name, context);
	if (!isComponent) {
		isComponent = hotLoader.isComponent(dasherizedName, context);
		if (isComponent) {
			renderComponentName = dasherizedName;
		}
	}
    // console.log('compute', {
    //   name, context, maybePropertyValue, astStringName,
    //   isComponent: hotLoader.isComponent(name, context),
    //   isHelper: hotLoader.isHelper(name)
    // });
    const hasPropInComponentContext = hasPropertyNameInContext(name, context);
    const isArgument = safeAstName.charAt(0) === '@' || safeAstName.startsWith('attrs.');
	if (!isArgument && (hasPropInComponentContext || (typeof maybePropertyValue !== 'undefined'))) {
      if (!hasPropInComponentContext && !isComponent && !hotLoader.isHelper(name)) {
        // if it's not component, not in scope and not helper - dunno, we need to render placeholder with value;
        return hotLoader.renderDynamicComponentHelper(name, context, maybePropertyValue);
      }
    }
    if (!isComponent) {
      if (hotLoader.isHelper(name)) {
        hotLoader.registerDynamicComponent(name);
        return hotLoader.dynamicComponentNameForHelperWrapper(name);
      } else {
        return hotLoader.renderDynamicComponentHelper(name, context, maybePropertyValue);
      }    
    }
    if (name === this.firstCompute) {
      this.firstCompute = false;
      this.timer = later(() => {
        this.recompute();
      });
      return hotLoader.placeholderComponentName();
    }

    if (!this.firstCompute) {
      this.firstCompute = name;
      this.firstComputeName = name;
    }

    if (this.firstComputeName !== name) {
      this.firstComputeName = name;
    }

    return renderComponentName;
  }
});
