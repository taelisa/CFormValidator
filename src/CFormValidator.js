;(function(window, document, undefined) {
  'use strict';

  var changeBubbles = (function(){
    var el = document.createElement('div');
    var eventName = 'onchange';
    var isSupported = (eventName in el);

    if (!isSupported) {
      el.setAttribute(eventName, 'return;');
      isSupported = 'function' === typeof el[eventName];
    }

    el = null;
    return isSupported;
  }());
  var ATTR_PREFIX = 'data-cform-';

  function CFormValidator(form, options) {
    if (!(this instanceof CFormValidator)) {
      return new CFormValidator(options);
    }

    this.settings = CFormValidator._defaultSettings;

    if (options) {
      for (var i in options) {
        this.settings[i] = options[i];
      }
    }

    this.form = 'string' === typeof form? document.forms[form] || document.getElementById(form) : form;

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

    if ('change' === this.settings.triggerOn) {
      if (changeBubbles) {
        this._handlers.change = function(e) {
          fieldHandler(e, self);
        };

        addEvent(this.form, 'change', this._handlers.change);
      } else {
        this._handlers.simulate = function(e) {
          simulateChangeHandler(e, self);
        };

        addEvent(this.form, 'beforeactivate', this._handlers.simulate);
        addEvent(this.form, 'click', this._handlers.simulate);
        addEvent(this.form, 'focusout', this._handlers.simulate);
      }
    } else if ('blur' === this.settings.triggerOn) {
      this._handlers.focusout = function(e) {
        fieldHandler(e, self);
      }

      addEvent(this.form, 'focusout', this._handlers.focusout);
    }
  }

  CFormValidator.prototype.reset = function() {
    this.submitBtns = this.withMatch = this.withRemote = this.withUid = this.formXHR = null;
    this.toValidate = true;
    this.form.noValidate = this.form._origNoValidate;

    removeEvent(this.form, 'submit', this._handlers.submit);
    removeEvent(this.form, 'click', this._handlers.click);
    this._handlers.submit = this._handlers.click = null;

    if ('change' === this.settings.triggerOn) {
      if (changeBubbles) {
        removeEvent(this.form, 'change', this._handlers.change);
        this._handlers.change = null;
      } else {
        removeEvent(this.form, 'beforeactivate', this._handlers.simulate);
        removeEvent(this.form, 'click', this._handlers.simulate);
        removeEvent(this.form, 'focusout', this._handlers.simulate);
        this._handlers.simulate = null;
      }
    } else if ('blur' === this.settings.triggerOn) {
      removeEvent(this.form, 'focusout', this._handlers.focusout);
      this._handlers.focusout = null;
    }
  }

  CFormValidator.prototype.setDisabledSubmit = function(disableFlag) {
    for (var i = this.submitBtns.length; i--;) {
      this.submitBtns[i].disabled = disableFlag;
    }
  }

  CFormValidator.prototype.validate = function() {
    var self = this;
    self.setDisabledSubmit(true);
    var result = self.isFormValidLocally();

    if (result.valid) {
      if (self.form.getAttribute(ATTR_PREFIX + 'remoteurl') && self.withRemote.length) {
        var postData = [];
        var i;

        for (i = self.withUid.length; i--;) {
          postData.push(encodeURIComponent(self.withUid[i].name) + '=' + encodeURIComponent(self.withUid[i].value));
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
          var valid = true;
          var invalidFields = [];
          var i;

          for (i in json) {
            if (true === json[i]) {
              self.settings.onValidField(self.form.elements[i]);
            } else {
              self.settings.onInvalidField(self.form.elements[i], json[i]);
              invalidFields.push(self.form.elements[i]);
              valid = false;
            }
          }

          (valid)? self.settings.onValidForm(self.form) : self.settings.onInvalidForm(invalidFields);
          self.setDisabledSubmit(false);
        });
      } else {
        self.setDisabledSubmit(false);
        self.settings.onValidForm(self.form);
      }
    } else {
      self.setDisabledSubmit(false);
      self.settings.onInvalidForm(result.invalidFields);
    }
  }

  CFormValidator.prototype.isFieldValid = function(field) {
    var isValid = true;
    var type = getElementType(field);
    var errorType;
    var pattern;

    if (this.settings.autoTrim && 'select' !== field.nodeName.toLowerCase() && !/^(checkbox|file|radio)$/.test(type)) {
      field.value = trim(field.value);
    }

    if (field.getAttribute(ATTR_PREFIX + 'match') && !CFormValidator._controls.match(field, this.form.elements[field.getAttribute(ATTR_PREFIX + 'match')])) {
      errorType = CFormValidator._errorTypes.match;
      isValid = false;
    }

    if (isValid && !CFormValidator._controls.required(field, this.form)) {
      var isRequired = hasBooleanAttribute(field, 'required') || hasBooleanAttribute(field, ATTR_PREFIX + 'required');

      if (!isRequired && 'radio' === type && this.form.elements[field.name].length) {
        var radios = this.form.elements[field.name];
        var i = radios.length;

        while (!isRequired && i--) {
          isRequired = hasBooleanAttribute(radios[i], 'required') || hasBooleanAttribute(radios[i], ATTR_PREFIX + 'required');
        }
      }

      if (isRequired) {
        this.settings.onInvalidField(field, CFormValidator._errorTypes.required);
        return false;
      } else {
        this.settings.onValidField(field);
        return true;
      }
    }

    if (isValid && (pattern = (field.getAttribute('pattern') || field.getAttribute(ATTR_PREFIX + 'pattern')))) {
      if (!CFormValidator._controls.pattern(field, pattern)) {
        isValid = false;
      } else if ('date' === pattern) {
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

    if (isValid && this.settings.customChecks && 'function' === typeof this.settings.customChecks[field.name]) {
      var result = this.settings.customChecks[field.name](field);

      isValid = result.valid;
      errorType = isValid? undefined : result.errorType;
    }

    (isValid)? this.settings.onValidField(field) : this.settings.onInvalidField(field, errorType);
    return isValid;
  }

  CFormValidator.prototype.isFormValidLocally = function() {
    var fields = this.form.elements;
    var invalidFields = [];
    var field;
    var i;

    for (i = 0; i < fields.length; i++) {
      field = fields[i];

      if (!field.name || field.disabled || field.readOnly || /^(fieldset|object)$/i.test(field.nodeName) || /^(button|hidden|keygen|output|reset|submit)$/.test(getElementType(field))) {
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
    date: /^\d{4}-(0[1-9]|1[012])-(0[1-9]|1\d|2\d|3[01])$/,
    digits: /^\d+$/,
    email: /^([a-zA-Z0-9-_\.])+@([a-zA-Z0-9-]\.?)*([a-zA-Z]){2,}$/,
    number: /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/,
    price: /^\d+(\.\d{1,2})?$/
  }

  CFormValidator._controls = {
    match: function(field1, field2) {
      return field1.value === field2.value;
    },
    max: function(field) {
      var max = field.getAttribute('max');
      var pattern = field.getAttribute(ATTR_PREFIX + 'pattern');

      if ('date' === getElementType(field) || (pattern && 'date' === pattern.toLowerCase())) {
        return CFormValidator._getDateObj(field.value) <= CFormValidator._getDateObj(max);
      }

      return parseFloat(field.value) <= parseFloat(max);
    },
    min: function(field) {
      var min = field.getAttribute('min');
      var pattern = field.getAttribute(ATTR_PREFIX + 'pattern');

      if ('date' === getElementType(field) || (pattern && 'date' === pattern.toLowerCase())) {
        return CFormValidator._getDateObj(field.value) >= CFormValidator._getDateObj(min);
      }

      return parseFloat(field.value) >= parseFloat(min);
    },
    required: function(field, form) {
      var result;
      var type = getElementType(field);

      if ('select' === field.nodeName.toLowerCase()) {
        if (hasBooleanAttribute(field, 'multiple') && -1 !== field.selectedIndex) {
          for (var i = 0, opt; !result && (opt = field.options[i]); i++) {
            result = opt.selected && '' !== opt.value;
          }
        } else {
          result = -1 !== field.selectedIndex && '' !== field.value;
        }
      } else if ('checkbox' === type) {
        result = field.checked;
      } else if ('radio' === type) {
        var checked = field.checked;

        if (!checked && form.elements[field.name].length) {
          var radios = form.elements[field.name];
          var i = radios.length;

          while (!checked && i--) {
            checked = radios[i].checked;
          }
        }

        result = checked;
      } else {
        result = null != field.value && '' !== field.value;
      }

      return result;
    },
    pattern: function(field, pattern) {
      if (-1 !== pattern.indexOf('||')) {
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
      var step = field.getAttribute('step');
      var pattern = field.getAttribute(ATTR_PREFIX + 'pattern');

      if ('any' === step.toLowerCase()) {
        return true;
      }

      if ('date' === getElementType(field) || (pattern && 'date' === pattern.toLowerCase())) {
        // ToDo
        return true;
      }

      return doModule(parseFloat(field.value), parseFloat(step)) === 0;
    },
    type: function(field) {
      switch (getElementType(field)) {
        case 'number':
          var value = parseFloat(field.value);
          return CFormValidator._patterns.number.test(field.value) && Number.POSITIVE_INFINITY !== value && Number.NEGATIVE_INFINITY !== value && value === value;
        case 'email':
          if (hasBooleanAttribute(field, 'multiple')) {
            var emails = field.value.split(',');

            for (var i = 0; i < emails.length; i++) {
              if (!CFormValidator._patterns.email.test(trim(emails[i]))) {
                return false;
              }
            }

            return true;
          } else {
            return CFormValidator._patterns.email.test(field.value);
          }
        case 'date':
          return CFormValidator._patterns.date.test(field.value) && CFormValidator._isValidDate(field.value);
      }

      return true;
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

    if (3 !== val.length) {
      return false;
    }

    var y = parseInt(val[0], 10);
    var m = parseInt (val[1], 10) - 1;
    var d = parseInt(val[2], 10);
    var date = new Date(y, m, d);

    return y === date.getFullYear() && m === date.getMonth() && d === date.getDate();
  }

  function onSubmitHandler (e, self) {
    if (self.toValidate) {
      if (e.preventDefault) {
        e.preventDefault();
      } else {
        e.returnValue = false;
      }

      self.validate();
    } else {
      self.toValidate = true;
    }
  }

  function checkSubmitBtn(e, self) {
    var elem = e.target || e.srcElement;

    if (/^(input|button)$/i.test(elem.nodeName) && /^(image|submit)$/.test(getElementType(elem))) {
      self.toValidate = !hasBooleanAttribute(elem, 'formnovalidate');
    }
  }

  function simulateChangeHandler(e, self) {
    var field = e.target || e.srcElement;
    var attr = ATTR_PREFIX + 'previousvalue';
    var type = getElementType(field);

    if (/^(input|select|textarea)$/i.test(field.nodeName) && !field.readOnly) {
      if ('beforeactivate' === e.type) {
        field.setAttribute(attr, field.value);
      } else if ('focusout' === e.type) {
        if (field.getAttribute(attr) !== field.value) {
          fieldHandler(e, self);
        }
        field.removeAttribute(attr);
      } else if ('click' === e.type && ('checkbox' === type || 'radio' === type || 'select' === field.nodeName.toLowerCase())) {
        fieldHandler(e, self);
      }
    }
  };

  function fieldHandler(e, self) {
    var field = e.target || e.srcElement;
    var i;

    if (!field.name) {
      return;
    }

    if (self.isFieldValid(field)) {
      if (field.value && self.form.getAttribute(ATTR_PREFIX + 'remoteurl') && hasBooleanAttribute(field, ATTR_PREFIX + 'remote')) {
        var xhr;
        var postData = [encodeURIComponent(field.name) + '=' + encodeURIComponent(field.value)];
        var i = self.withUid.length;

        while (i--) {
          postData.push(encodeURIComponent(self.withUid[i].name) + '=' + encodeURIComponent(self.withUid[i].value));
        }

        if (field.xhr) {
          xhr = field.xhr;
          xhr.abort();
        } else {
          xhr = createXHR();
          field.xhr = xhr;
        }

        doXHRRequest(xhr, self.form.getAttribute(ATTR_PREFIX + 'remoteurl'), postData, function(json) {
          field.xhr = undefined;

          (json && true === json[field.name])
            ? self.settings.onValidField(field)
            : self.settings.onInvalidField(field, json[field.name]);
        });
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
    !obj.addEventListener? obj.attachEvent('on' + eventName, listener) : obj.addEventListener(eventName, listener, false);
  }

  function removeEvent(obj, eventName, listener) {
    !obj.removeEventListener? obj.detachEvent('on' + eventName, listener) : obj.removeEventListener(eventName, listener, false);
  }

  function trim(string) {
    return !String.prototype.trim? string.replace(/^\s+|\s+$/g, '') : string.trim();
  }

  function hasBooleanAttribute(el, attr) {
    return 'hasAttribute' in el? el.hasAttribute(attr) : null != el.getAttribute(attr);
  }

  function getElementType(el) {
    return (el.getAttribute('type') || el.type).toLowerCase();
  }

  function createXHR() {
    return !window.XMLHttpRequest? new ActiveXObject('Microsoft.XMLHTTP') : new XMLHttpRequest();
  }

  function doXHRRequest(xhr, url, postData, callback) {
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    xhr.onreadystatechange = function() {
      if (4 === this.readyState && 200 === this.status) {
        callback(JSON.parse(this.responseText));
      }
    };

    xhr.send(postData.length? postData.join('&') : null);
  }

  function doModule(num, mod) {
    var pow = Math.pow(10, (('' + mod).split('.')[1] || '').length);
    return ((num * pow) % (mod * pow)) / pow;
  };

  window.CFormValidator = CFormValidator;
}(this, this.document));
