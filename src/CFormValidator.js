;( function( window, document, undefined ) { 'use strict';

	var changeBubbles = eventSupported( 'change' ),
		ATTR_PREFIX = 'data-cform-';

	function CFormValidator( options ) {
		this.settings = CFormValidator._defaultSettings;
		this.form = null;

		if ( options ) {
			for( var i in options ) {
				this.settings[i] = options[i];
			}
		}

		if ( typeof this.settings.form === 'string' ) {
			this.form = document.forms[this.settings.form] || document.getElementById( this.settings.form );
		}

		delete this.settings.form;

		if ( !this.form || !this.form.elements ) {
			return;
		}

		this.form.noValidate = true;

		var submitBtns = this.form.querySelectorAll( '[type=submit]' ),
			withMatch = this.form.querySelectorAll( '[' + ATTR_PREFIX + 'match]' ),
			withRemote = this.form.querySelectorAll( '[' + ATTR_PREFIX + 'remote]' ),
			withUid = this.form.querySelectorAll( '[' + ATTR_PREFIX + 'uid]' ),
			formXHR = createXHR(),
			self = this;

		bindEvent( this.form, 'submit', function( e ) {
			if ( e.preventDefault ) {
				e.preventDefault();
			}
			else {
				e.returnValue = false;
			}

			var result = self.isFormValidLocally();

			if ( result.valid ) {
				if ( self.form.hasAttribute( ATTR_PREFIX + 'remoteurl' ) && withRemote.length > 0 ) {
					var postData = [],
						i;

					for ( i = withUid.length; i--; ) {
						postData.push( encodeURIComponent( withUid[i].name ) + '=' + encodeURIComponent( withUid[i].value ) );
					}

					for ( i = submitBtns.length; i--; ) {
						submitBtns[i].disabled = true;
					}

					for ( i = withRemote.length; i--; ) {
						var field = withRemote[i];

						if ( field.xhr ) {
							field.xhr.abort();
							field.xhr = undefined;
						}

						postData.push( encodeURIComponent( field.name ) + '=' + encodeURIComponent( field.value ) );
					}

					doXHRRequest( formXHR, self.form.getAttribute( ATTR_PREFIX + 'remoteurl' ), postData, function( json ) {
						var valid = true,
							invalidFields = [],
							i;

						for ( i in json ) {
							if ( json[i] === true ) {
								self.settings.onValidField( self.form.elements[i] );
							}
							else {
								self.settings.onInvalidField( self.form.elements[i], json[i] );
								invalidFields.push( self.form.elements[i] );
								valid = false;
							}
						}

						( valid )? self.settings.onValidForm( self.form ) : self.settings.onInvalidForm( invalidFields );

						for ( i = submitBtns.length; i--; ) {
							submitBtns[i].disabled = false;
						}
					});
				}
				else {
					self.settings.onValidForm( self.form );
				}
			}
			else {
				self.settings.onInvalidForm( result.invalidFields );
			}
		});

		if ( this.settings.triggerOnChange ) {
			if ( changeBubbles ) {
				bindEvent( this.form, 'change', onchangeHandler );
			}
			else {
				bindEvent( this.form, 'beforeactivate', simulateChangeHandler );
				bindEvent( this.form, 'click', simulateChangeHandler );
				bindEvent( this.form, 'focusout', simulateChangeHandler );
			}
		}

		function simulateChangeHandler( e ) {
			var elem = e.target || e.srcElement,
				attr = ATTR_PREFIX + 'previousvalue',
				type = elem.type;

			if ( /^(input|select|textarea)$/i.test( elem.nodeName ) && !elem.readOnly ) {
				if ( e.type === 'beforeactivate' ) {
					elem.setAttribute( attr, elem.value );
				}
				else if ( e.type === 'focusout' ) {
					if ( elem.getAttribute( attr ) !== elem.value ) {
						onchangeHandler( e );
					}
					elem.removeAttribute( attr );
				}
				else if ( e.type === 'click' && ( type === 'checkbox' || type === 'radio' || elem.nodeName.toLowerCase() === 'select' ) ) {
					onchangeHandler( e );
				}
			}
		};

		function onchangeHandler(e) {
			var field = e.target || e.srcElement,
				i;

			if ( self.isFieldValid( field ) ) {
				if ( field.value && self.form.hasAttribute( ATTR_PREFIX + 'remoteurl' ) && field.hasAttribute( ATTR_PREFIX + 'remote' ) ) {
					var xhr,
						postData = [encodeURIComponent( field.name ) + '=' + encodeURIComponent( field.value )],
						i = withUid.length;

						while ( i-- ) {
							postData.push( encodeURIComponent( withUid[i].name ) + '=' + encodeURIComponent( withUid[i].value ) );
						}

					if ( field.xhr ) {
						xhr = field.xhr;
						xhr.abort();
					}
					else {
						xhr = createXHR();
						field.xhr = xhr;
					}

					doXHRRequest( xhr, self.form.getAttribute( ATTR_PREFIX + 'remoteurl' ), postData, function( json ) {
						field.xhr = undefined;

						( json && json[field.name] === true )
							? self.settings.onValidField( field )
							: self.settings.onInvalidField( field, json[field.name] );
					});
				}
				else if ( typeof self.settings.customCheckField === 'function' ) {
					self.settings.customCheckField( field );
				}
			}

			for ( i = 0; i < withMatch.length; i++ ) {
				var match = withMatch[i];

				if ( field.name === match.getAttribute( ATTR_PREFIX + 'match' ) ) {
					if ( ( !field.value.length && !match.value.length ) || match.value.length ) {
						self.isFieldValid( match );
					}
				}
			}
		}
	}

	CFormValidator._defaultSettings = {
		onInvalidField: function( field, errorType ){},
		onValidField: function( field ){},
		onValidForm: function( form ) {
			form.submit();
		},
		onInvalidForm: function( invalidFields ){},
		triggerOnChange: true,
		customCheckField: null
	};

	CFormValidator._patterns = {
		cap:		/^\d{5}$/,
		date:		/^\d{4}-(0[1-9]|1[012])-(0[1-9]|1\d|2\d|3[01])$/,
		digits:		/^\d+$/,
		email:		/^([a-zA-Z0-9-_\.])+@([a-zA-Z0-9-]\.?)*([a-zA-Z]){2,}$/,
		number:		/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/,
		price:		/^\d+(\.\d{1,2})?$/,
		fiscalCode:	/^[0-9a-zA-Z]{16}$/,
		vatNumber:	/^\d{11}$/
	}

	CFormValidator._controls = {
		match: function( field1, field2 ) {
			return field1.value === field2.value;
		},
		max: function( field ) {
			var max = field.getAttribute( 'max' ),
				type = ( field.getAttribute( 'type' ) || field.type ).toLowerCase();

			if ( type === 'date' ) {
				// ToDo
			}
			else if ( parseFloat( field.value ) > parseFloat( max ) ) {
				return false;
			}

			return true;
		},
		min: function( field ) {
			var min = field.getAttribute( 'min' ),
				type = ( field.getAttribute( 'type' ) || field.type ).toLowerCase();

			if ( type === 'date' ) {
				// ToDo
			}
			else if ( parseFloat( field.value ) < parseFloat( min ) ) {
				return false;
			}

			return true;
		},
		required: function( field, form ) {
			var result;

			if ( field.nodeName.toLowerCase() === 'select' ) {
				if ( field.hasAttribute( 'multiple' ) && field.selectedIndex !== -1 ) {
					for ( var i = 0, opt; !result && ( opt = field.options[i] ); i++ ) {
						result = opt.selected && opt.value !== '';
					}
				}
				else {
					result = field.selectedIndex !== -1 && field.value !== '';
				}
			}
			else if ( field.type === 'checkbox' ) {
				result = field.checked;
			}
			else if ( field.type === 'radio' ) {
				var checked = field.checked;

				if ( !checked && form.elements[field.name].length ) {
					var radios = form.elements[field.name],
						i = radios.length;

					while ( !checked && i-- ) {
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
		pattern: function( field, pattern ) {
			if ( pattern.indexOf( '||' ) !== -1 ) {
				var patterns = pattern.split( '||' );

				for ( var i = 0; i < patterns.length; i++ ) {
					if ( this.pattern( field, patterns[i] ) ) {
						return true;
					}
				}

				return false;
			}

			return ( CFormValidator._patterns.hasOwnProperty( pattern ) )
				? CFormValidator._patterns[pattern].test( field.value )
				: new RegExp( '^' + pattern + '$' ).test( field.value );
		},
		step: function( field ) {
			var step = field.getAttribute( 'step' ),
				type = ( field.getAttribute( 'type' ) || field.type ).toLowerCase();

			if ( step.toLowerCase() === 'any' ) {
				return true;
			}

			if ( type === 'date' ) {
				// ToDo
			}
			else if ( doModule( parseFloat( field.value ), parseFloat( step ) ) !== 0 ) {
				return false;
			}

			return true;
		},
		type: function( field ) {
			var type = ( field.getAttribute( 'type' ) || field.type ).toLowerCase();

			switch ( type ) {
				case 'number':
					var value = parseFloat( field.value );

					if ( CFormValidator._patterns.number.test( field.value ) && value !== Number.POSITIVE_INFINITY && value !== Number.NEGATIVE_INFINITY && value === value ) {
						return true;
					}

					return false;
				case 'email':
					if ( field.hasAttribute( 'multiple' ) ) {
						var emails = field.value.split( ',' );

						for ( var i = 0; i < emails.length; i++ ) {
							if ( ! CFormValidator._patterns.email.test( trim( emails[i] ) ) ) {
								return false;
							}
						}

						return true;
					}
					else {
						return CFormValidator._patterns.email.test( field.value );
					}
				case 'date':
					return CFormValidator._patterns.date.test( field.value ) && CFormValidator._isValidDate( field.value );
				default:
					return true;
			}
		}
	}

	CFormValidator.prototype.isFieldValid = function( field ) {
		var result = true,
			type = ( field.getAttribute( 'type' ) || field.type ).toLowerCase(),
			errorType;

		if ( field.nodeName.toLowerCase() !== 'select' && type !== 'radio' && type !== 'checkbox' ) {
			field.value = trim( field.value );
		}

		if ( field.hasAttribute( ATTR_PREFIX + 'match' ) && !CFormValidator._controls.match( field, this.form.elements[field.getAttribute( ATTR_PREFIX + 'match' )] ) ) {
			errorType = 'match';
			result = false;
		}

		if ( result && !CFormValidator._controls.required( field, this.form ) ) {
			var isRequired = field.hasAttribute( 'required' );

			if ( !isRequired && type === 'radio' && this.form.elements[field.name].length ) {
				var radios = this.form.elements[field.name],
					i = radios.length;

				while ( !isRequired && i-- ) {
					isRequired = radios[i].hasAttribute( 'required' );
				}
			}

			if ( isRequired ) {
				this.settings.onInvalidField( field, 'required' );
				return false;
			}
			else {
				this.settings.onValidField( field );
				return true;
			}
		}

		// ToDo: list attribute

		if ( result && ( field.hasAttribute( 'pattern' ) || field.hasAttribute( ATTR_PREFIX + 'pattern' ) ) ) {
			var pattern = field.getAttribute( 'pattern' ) || field.getAttribute( ATTR_PREFIX + 'pattern' );

			if ( !CFormValidator._controls.pattern( field, pattern ) ) {
				result = false;
			}
			else if ( pattern === 'date' ) {
				result = CFormValidator._isValidDate( field.value );
			}

			if ( !result ) {
				errorType = 'pattern';
			}
		}

		if ( result && ( field.hasAttribute( 'maxlength' ) && field.value.length > parseInt( field.getAttribute( 'maxlength' ), 10 ) ) ) {
			errorType = 'maxlength';
			result = false;
		}

		if ( result && !CFormValidator._controls.type( field ) ) {
			errorType = 'type';
			result = false;
		}

		if ( result && field.hasAttribute( 'min' ) && !CFormValidator._controls.min( field ) ) {
			errorType = 'min';
			result = false;
		}

		if ( result && field.hasAttribute( 'max' ) && !CFormValidator._controls.max( field ) ) {
			errorType = 'max';
			result = false;
		}

		if ( result && field.hasAttribute( 'step' ) && !CFormValidator._controls.step( field ) ) {
			errorType = 'step';
			result = false;
		}

		if ( result ) {
			this.settings.onValidField( field );
		}
		else {
			this.settings.onInvalidField( field, errorType );
		}

		return result;
	}

	CFormValidator.prototype.isFormValidLocally = function() {
		var fields = this.form.elements,
			invalidFields = [],
			field, i;

		for ( i = 0; i < fields.length; i++ ) {
			field = fields[i];

			if ( field.disabled || field.readOnly || field.nodeName.toLowerCase() === 'fieldset' || /^(button|hidden|reset|submit)$/.test( field.type ) ) {
				continue;
			}

			if ( !this.isFieldValid( field ) ) {
				invalidFields.push(field);
			}
		}

		return {
			valid: !invalidFields.length,
			invalidFields: invalidFields
		}
	}

	CFormValidator._isValidDate = function( val ) {
		val = val.split( '-' );

		if ( val.length !== 3 ) {
			return false;
		}

		var y = parseInt( val[0], 10 ),
			m = parseInt ( val[1], 10) - 1,
			d = parseInt( val[2], 10),
			date = new Date( y, m, d );

		return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
	}

	function bindEvent( obj, eventName, listener ) {
		( !obj.addEventListener )
			? obj.attachEvent( 'on' + eventName, listener )
			: obj.addEventListener( eventName, listener, false );
	}

	function trim( string ) {
		return ( !String.prototype.trim )
			? string.replace( /^\s+|\s+$/g, '' )
			: string.trim();
	}

	function createXHR() {
		return ( !window.XMLHttpRequest )? new ActiveXObject( 'Microsoft.XMLHTTP' ) : new XMLHttpRequest();
	}

	function doXHRRequest( xhr, url, postData, callback ) {
		xhr.open( 'POST', url, true );
		xhr.setRequestHeader( 'Content-Type', 'application/x-www-form-urlencoded' );
		xhr.setRequestHeader( 'X-Requested-With', 'XMLHttpRequest' );

		xhr.onreadystatechange = function() {
			if ( this.readyState === 4 && this.status === 200 ) {
				callback( JSON.parse( this.responseText ) );
			}
		};

		xhr.send( postData.length? postData.join( '&' ) : null );
	}

	function doModule( num, mod ) {
		var pow = Math.pow( 10, ( ( '' + mod ).split( '.' )[1] || '' ).length );
		return ( ( num * pow ) % ( mod * pow ) ) / pow;
	};

	function eventSupported( eventName ) {
		var el = document.createElement( 'div' ),
			eventName = 'on' + eventName,
			isSupported = ( eventName in el );

		if ( !isSupported ) {
			el.setAttribute( eventName, 'return;' );
			isSupported = typeof el[eventName] === 'function';
		}

		el = null;
		return isSupported;
	}

	window.CFormValidator = CFormValidator;

}( this, this.document ) );