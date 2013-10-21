;(function(window, document, undefined) { 'use strict';

	var changeBubbles = eventSupported('change'),
		ATTR_PREFIX = 'data-cform-';

	function CFormValidator(form, options) {
		if (!(this instanceof CFormValidator)) {
			return new CFormValidator(options);
		}

		this.settings = CFormValidator._defaultSettings;

		if (options) {
			for(var i in options) {
				this.settings[i] = options[i];
			}
		}

		this.form = typeof form === 'string'? document.forms[form] : form;

		if (!this.form || !this.form.elements) {
			throw new Error('The element must be an HTML Form');
		}

		this.init();
	}

	CFormValidator.prototype.init = function() {
		this.submitBtns = this.form.querySelectorAll('[type=submit], [type=image]');
		this.withMatch = this.form.querySelectorAll('[' + ATTR_PREFIX + 'match]');
		this.withRemote = this.form.querySelectorAll('[' + ATTR_PREFIX + 'remote]');
		this.withUid = this.form.querySelectorAll('[' + ATTR_PREFIX + 'uid]');
		this.formXHR = createXHR();
		this.toValidate = true;
		this._origNoValidate = this.form.noValidate;
		this.form.noValidate = true;

		var self = this;

		this._handlers = {
			submit: function(e) {
				onSubmitHandler(e, self);
			},
			click: function(e) {
				checkSubmitBtn(e, self);
			}
		};

		addEvent(this.form, 'submit', this._handlers.submit);
		addEvent(this.form, 'click', this._handlers.click);

		if (this.settings.triggerOn === 'change') {
			if (changeBubbles) {
				this._handlers.change = function(e) {
					fieldHandler(e, self);
				};

				addEvent(this.form, 'change', this._handlers.change);
			}
			else {
				this._handlers.simulate = function(e) {
					simulateChangeHandler(e, self);
				};

				addEvent(this.form, 'beforeactivate', this._handlers.simulate);
				addEvent(this.form, 'click', this._handlers.simulate);
				addEvent(this.form, 'focusout', this._handlers.simulate);
			}
		}
		else if (this.settings.triggerOn === 'blur') {
			this._handlers.focusout = function(e) {
				fieldHandler(e, self);
			}

			addEvent(this.form, 'focusout', this._handlers.focusout);
		}
	}

	CFormValidator.prototype.reset = function() {
		this.submitBtns = this.withMatch = this.withRemote = this.withUid = this.formXHR = null;
		this.form.noValidate = this.form._origNoValidate;

		removeEvent(this.form, 'submit', this._handlers.submit);
		removeEvent(this.form, 'click', this._handlers.click);

		this._handlers.submit = this._handlers.click = null;

		if (this.settings.triggerOn === 'change') {
			if (changeBubbles) {
				removeEvent(this.form, 'change', this._handlers.change);
				this._handlers.change = null;
			}
			else {
				removeEvent(this.form, 'beforeactivate', this._handlers.simulate);
				removeEvent(this.form, 'click', this._handlers.simulate);
				removeEvent(this.form, 'focusout', this._handlers.simulate);
				this._handlers.simulate = null;
			}
		}
		else if (this.settings.triggerOn === 'blur') {
			removeEvent(this.form, 'focusout', this._handlers.focusout);
			this._handlers.focusout = null;
		}
	}

	CFormValidator.prototype.validate = function() {
		var self = this,
			result = self.isFormValidLocally();

		if (result.valid) {
			if (self.form.getAttribute(ATTR_PREFIX + 'remoteurl') && self.withRemote.length) {
				var postData = [],
					i;

				for (i = self.withUid.length; i--;) {
					postData.push(encodeURIComponent(self.withUid[i].name) + '=' + encodeURIComponent(self.withUid[i].value));
				}

				for (i = self.submitBtns.length; i--;) {
					self.submitBtns[i].disabled = true;
				}

				for (i = self.withRemote.length; i--;) {
					var field = self.withRemote[i];

					if (field.xhr) {
						field.xhr.abort();
						field.xhr = undefined;
					}

					postData.push(encodeURIComponent(field.name) + '=' + encodeURIComponent(field.value));
				}

				doXHRRequest(self.formXHR, self.form.getAttribute(ATTR_PREFIX + 'remoteurl'), postData, function(json) {
					var valid = true,
						invalidFields = [],
						i;

					for (i in json) {
						if (json[i] === true) {
							self.settings.onValidField(self.form.elements[i]);
						}
						else {
							self.settings.onInvalidField(self.form.elements[i], json[i]);
							invalidFields.push(self.form.elements[i]);
							valid = false;
						}
					}

					(valid)? self.settings.onValidForm(self.form) : self.settings.onInvalidForm(invalidFields);

					for (i = self.submitBtns.length; i--;) {
						self.submitBtns[i].disabled = false;
					}
				});
			}
			else {
				self.settings.onValidForm(self.form);
			}
		}
		else {
			self.settings.onInvalidForm(result.invalidFields);
		}
	}

	CFormValidator.prototype.isFieldValid = function(field) {
		var isValid = true,
			type = (field.getAttribute('type') || field.type).toLowerCase(),
			errorType;

		if (this.settings.autoTrim && field.nodeName.toLowerCase() !== 'select' && !/^(checkbox|file|radio)$/.test(type)) {
			field.value = trim(field.value);
		}

		if (field.getAttribute(ATTR_PREFIX + 'match') && !CFormValidator._controls.match(field, this.form.elements[field.getAttribute(ATTR_PREFIX + 'match')])) {
			errorType = CFormValidator._errorTypes.match;
			isValid = false;
		}

		if (isValid && !CFormValidator._controls.required(field, this.form)) {
			var isRequired = hasAttr(field, 'required');

			if (!isRequired && type === 'radio' && this.form.elements[field.name].length) {
				var radios = this.form.elements[field.name],
					i = radios.length;

				while (!isRequired && i--) {
					isRequired = hasAttr(radios[i], 'required');
				}
			}

			if (isRequired) {
				this.settings.onInvalidField(field, CFormValidator._errorTypes.required);
				return false;
			}
			else {
				this.settings.onValidField(field);
				return true;
			}
		}

		if (isValid && (field.getAttribute('pattern') || field.getAttribute(ATTR_PREFIX + 'pattern'))) {
			var pattern = field.getAttribute('pattern') || field.getAttribute(ATTR_PREFIX + 'pattern');

			if (!CFormValidator._controls.pattern(field, pattern)) {
				isValid = false;
			}
			else if (pattern === 'date') {
				isValid = CFormValidator._isValidDate(field.value);
			}

			if (!isValid) {
				errorType = CFormValidator._errorTypes.pattern;
			}
		}

		if (isValid && (field.getAttribute('maxlength') && field.value.length > parseInt(field.getAttribute('maxlength'), 10))) {
			errorType = CFormValidator._errorTypes.maxlength;
			isValid = false;
		}

		if (isValid && !CFormValidator._controls.type(field)) {
			errorType = CFormValidator._errorTypes.type;
			isValid = false;
		}

		if (isValid && field.getAttribute('min') && !CFormValidator._controls.min(field)) {
			errorType = CFormValidator._errorTypes.min;
			isValid = false;
		}

		if (isValid && field.getAttribute('max') && !CFormValidator._controls.max(field)) {
			errorType = CFormValidator._errorTypes.max;
			isValid = false;
		}

		if (isValid && field.getAttribute('step') && !CFormValidator._controls.step(field)) {
			errorType = CFormValidator._errorTypes.step;
			isValid = false;
		}

		if (isValid && this.settings.customChecks && typeof this.settings.customChecks[field.name] === 'function') {
			var result = this.settings.customChecks[field.name](field);

			isValid = result.valid;
			errorType = isValid? undefined : result.errorType;
		}

		(isValid)? this.settings.onValidField(field) : this.settings.onInvalidField(field, errorType);

		return isValid;
	}

	CFormValidator.prototype.isFormValidLocally = function() {
		var fields = this.form.elements,
			invalidFields = [],
			field, i;

		for (i = 0; i < fields.length; i++) {
			field = fields[i];

			if (!field.name || field.disabled || field.readOnly || /^(fieldset|object)$/i.test(field.nodeName) || /^(button|hidden|keygen|output|reset|submit)$/.test(field.type)) {
				continue;
			}

			if (!this.isFieldValid(field)) {
				invalidFields.push(field);
			}
		}

		return {
			valid: !invalidFields.length,
			invalidFields: invalidFields
		}
	}

	CFormValidator._defaultSettings = {
		autoTrim: true,
		onInvalidField: function(field, errorType){},
		onValidField: function(field){},
		onValidForm: function(form) {
			form.submit();
		},
		onInvalidForm: function(invalidFields){},
		triggerOn: 'change',
		customChecks: null
	};

	CFormValidator._patterns = {
		date:		/^\d{4}-(0[1-9]|1[012])-(0[1-9]|1\d|2\d|3[01])$/,
		digits:		/^\d+$/,
		email:		/^([a-zA-Z0-9-_\.])+@([a-zA-Z0-9-]\.?)*([a-zA-Z]){2,}$/,
		number:		/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/,
		price:		/^\d+(\.\d{1,2})?$/
	}

	CFormValidator._controls = {
		match: function(field1, field2) {
			return field1.value === field2.value;
		},
		max: function(field) {
			var max = field.getAttribute('max'),
				type = (field.getAttribute('type') || field.type).toLowerCase(),
				pattern = field.getAttribute(ATTR_PREFIX + 'pattern');

			if (type === 'date' || (pattern && pattern.toLowerCase() === 'date')) {
				return CFormValidator._getDateObj(field.value) <= CFormValidator._getDateObj(max);
			}

			return parseFloat(field.value) <= parseFloat(max);
		},
		min: function(field) {
			var min = field.getAttribute('min'),
				type = (field.getAttribute('type') || field.type).toLowerCase(),
				pattern = field.getAttribute(ATTR_PREFIX + 'pattern');

			if (type === 'date' || (pattern && pattern.toLowerCase() === 'date')) {
				return CFormValidator._getDateObj(field.value) >= CFormValidator._getDateObj(min);
			}

			return parseFloat(field.value) >= parseFloat(min);
		},
		required: function(field, form) {
			var result;

			if (field.nodeName.toLowerCase() === 'select') {
				if (hasAttr(field, 'multiple') && field.selectedIndex !== -1) {
					for (var i = 0, opt; !result && (opt = field.options[i]); i++) {
						result = opt.selected && opt.value !== '';
					}
				}
				else {
					result = field.selectedIndex !== -1 && field.value !== '';
				}
			}
			else if (field.type === 'checkbox') {
				result = field.checked;
			}
			else if (field.type === 'radio') {
				var checked = field.checked;

				if (!checked && form.elements[field.name].length) {
					var radios = form.elements[field.name],
						i = radios.length;

					while (!checked && i--) {
						checked = radios[i].checked;
					}
				}

				result = checked;
			}
			else {
				result = field.value != null && field.value !== '';
			}

			return result;
		},
		pattern: function(field, pattern) {
			if (pattern.indexOf('||') !== -1) {
				var patterns = pattern.split('||');

				for (var i = 0; i < patterns.length; i++) {
					if (this.pattern(field, patterns[i])) {
						return true;
					}
				}

				return false;
			}

			return (CFormValidator._patterns.hasOwnProperty(pattern))
				? CFormValidator._patterns[pattern].test(field.value)
				: new RegExp('^' + pattern + '$').test(field.value);
		},
		step: function(field) {
			var step = field.getAttribute('step'),
				type = (field.getAttribute('type') || field.type).toLowerCase(),
				pattern = field.getAttribute(ATTR_PREFIX + 'pattern');

			if (step.toLowerCase() === 'any') {
				return true;
			}

			if (type === 'date' || (pattern && pattern.toLowerCase() === 'date')) {
				// ToDo
				return true;
			}

			return doModule(parseFloat(field.value), parseFloat(step)) === 0;
		},
		type: function(field) {
			var type = (field.getAttribute('type') || field.type).toLowerCase();

			switch (type) {
				case 'number':
					var value = parseFloat(field.value);

					if (CFormValidator._patterns.number.test(field.value) && value !== Number.POSITIVE_INFINITY && value !== Number.NEGATIVE_INFINITY && value === value) {
						return true;
					}

					return false;
				case 'email':
					if (hasAttr(field, 'multiple')) {
						var emails = field.value.split(',');

						for (var i = 0; i < emails.length; i++) {
							if (!CFormValidator._patterns.email.test(trim(emails[i]))) {
								return false;
							}
						}

						return true;
					}
					else {
						return CFormValidator._patterns.email.test(field.value);
					}
				case 'date':
					return CFormValidator._patterns.date.test(field.value) && CFormValidator._isValidDate(field.value);
				default:
					return true;
			}
		}
	}

	CFormValidator._errorTypes = {
		required: 'valueMissing',
		pattern: 'patternMismatch',
		maxlength: 'tooLong',
		type: 'typeMismatch',
		match: 'notMatching',
		min: 'rangeUnderflow',
		max: 'rangeOverflow',
		step: 'stepMismatch'
	}

	CFormValidator._getDateObj = function(val) {
		val = val.split('-');
		return new Date(val[0], parseInt(val[1]) - 1, val[2]);
	}

	CFormValidator._isValidDate = function(val) {
		val = val.split('-');

		if (val.length !== 3) {
			return false;
		}

		var y = parseInt(val[0], 10),
			m = parseInt (val[1], 10) - 1,
			d = parseInt(val[2], 10),
			date = new Date(y, m, d);

		return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
	}

	function onSubmitHandler (e, self) {
		if (self.toValidate) {
			if (e.preventDefault) {
				e.preventDefault();
			}
			else {
				e.returnValue = false;
			}

			self.validate();
		}
		else {
			self.toValidate = true;
		}
	}

	function checkSubmitBtn(e, self) {
		var elem = e.target || e.srcElement;

		if (/^(input|button)$/i.test(elem.nodeName) && /^(image|submit)$/.test(elem.type)) {
			self.toValidate = !hasAttr(elem, 'formnovalidate');
		}
	}

	function simulateChangeHandler(e, self) {
		var field = e.target || e.srcElement,
			attr = ATTR_PREFIX + 'previousvalue',
			type = field.type;

		if (/^(input|select|textarea)$/i.test(field.nodeName) && !field.readOnly) {
			if (e.type === 'beforeactivate') {
				field.setAttribute(attr, field.value);
			}
			else if (e.type === 'focusout') {
				if (field.getAttribute(attr) !== field.value) {
					fieldHandler(e, self);
				}
				field.removeAttribute(attr);
			}
			else if (e.type === 'click' && (type === 'checkbox' || type === 'radio' || field.nodeName.toLowerCase() === 'select')) {
				fieldHandler(e, self);
			}
		}
	};

	function fieldHandler(e, self) {
		var field = e.target || e.srcElement,
			i;

		if (!field.name) {
			return;
		}

		if (self.isFieldValid(field)) {
			if (field.value && self.form.getAttribute(ATTR_PREFIX + 'remoteurl') && hasAttr(field, ATTR_PREFIX + 'remote')) {
				var xhr,
					postData = [encodeURIComponent(field.name) + '=' + encodeURIComponent(field.value)],
					i = self.withUid.length;

					while (i--) {
						postData.push(encodeURIComponent(self.withUid[i].name) + '=' + encodeURIComponent(self.withUid[i].value));
					}

				if (field.xhr) {
					xhr = field.xhr;
					xhr.abort();
				}
				else {
					xhr = createXHR();
					field.xhr = xhr;
				}

				doXHRRequest(xhr, self.form.getAttribute(ATTR_PREFIX + 'remoteurl'), postData, function(json) {
					field.xhr = undefined;

					(json && json[field.name] === true)
						? self.settings.onValidField(field)
						: self.settings.onInvalidField(field, json[field.name]);
				});
			}
			else if (typeof self.settings.customCheckField === 'function') {
				self.settings.customCheckField(field);
			}
		}

		for (i = 0; i < self.withMatch.length; i++) {
			var match = self.withMatch[i];

			if (field.name === match.getAttribute(ATTR_PREFIX + 'match')) {
				if ((!field.value.length && !match.value.length) || match.value.length) {
					self.isFieldValid(match);
				}
			}
		}
	}

	function addEvent(obj, eventName, listener) {
		(!obj.addEventListener)
			? obj.attachEvent('on' + eventName, listener)
			: obj.addEventListener(eventName, listener, false);
	}

	function removeEvent(obj, eventName, listener) {
		(!obj.removeEventListener)
			? obj.detachEvent('on' + eventName, listener)
			: obj.removeEventListener(eventName, listener, false);
	}

	function trim(string) {
		return (!String.prototype.trim)
			? string.replace(/^\s+|\s+$/g, '')
			: string.trim();
	}

	function hasAttr(obj, attr) {
		return 'hasAttribute' in obj? obj.hasAttribute(attr) : obj.getAttribute(attr) != null;
	}

	function createXHR() {
		return (!window.XMLHttpRequest)? new ActiveXObject('Microsoft.XMLHTTP') : new XMLHttpRequest();
	}

	function doXHRRequest(xhr, url, postData, callback) {
		xhr.open('POST', url, true);
		xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
		xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

		xhr.onreadystatechange = function() {
			if (this.readyState === 4 && this.status === 200) {
				callback(JSON.parse(this.responseText));
			}
		};

		xhr.send(postData.length? postData.join('&') : null);
	}

	function doModule(num, mod) {
		var pow = Math.pow(10, (('' + mod).split('.')[1] || '').length);
		return ((num * pow) % (mod * pow)) / pow;
	};

	function eventSupported(type) {
		var el = document.createElement('div'),
			eventName = 'on' + type,
			isSupported = (eventName in el);

		if (!isSupported) {
			el.setAttribute(eventName, 'return;');
			isSupported = typeof el[eventName] === 'function';
		}

		el = null;
		return isSupported;
	}

	window.CFormValidator = CFormValidator;

}(this, this.document));
