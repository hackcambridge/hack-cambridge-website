import { fields, validators, widgets, create as createForm, FieldParameters } from 'forms';
import countryList from 'country-list';
import * as validator from 'validator';

import { field as fileField, typeValidator as fileTypeValidator, sizeValidator as fileSizeValidator } from './file-field';
import { multiCheckboxWidget } from './checkbox';
import { getEarliestGraduationDateToAccept } from 'js/shared/dates';

const countries = countryList();

/**
 * Allows us to optimise the list creation by only making it once, lazily.
 */
let countryChoices: { [id: string]: string } = null;
function createCountryChoices() {
  if (countryChoices == null) {
    countryChoices = {};
    // Add an invalid placeholder so that the user doesn't accidentally miss this box.
    // The forms package does not support placeholder HTML5 attributes, so the validation enforces that this is not selected. 
    countryChoices[''] = 'Choose a Country';
    // Add United Kingdom to the top of the country choices since it is the most likely to be applicable.
    countryChoices['GB'] = 'United Kingdom';
    countries.getData().forEach(({ code, name }) => {
      countryChoices[code] = name;
    });
  }

  return countryChoices;
}

export const maxFieldSize = 1024 * 1024 * 2; // 2mb

const cssClasses = {
  error: [ 'error_msg form-error-message' ],
  label: [ 'form-label-longform' ],
  field: [ 'form-row', 'form-row-margin' ],
};

const requiredField = validators.required('This field is required.');
const confirmationAndTermsValidationMessage = 'We need both confirmation of your student status and your acceptance\
  of the terms and conditions, privacy policy, and the MLH Code of Conduct.';

function textareaField(label, maxlength, options: any = { }) {
  const stringFieldValidators = options.validators ? options.validators : [];
  stringFieldValidators.push(validators.maxlength(maxlength));

  return fields.string(Object.assign({ }, options, {
    widget: widgets.textarea(<any>{
      maxlength,
      classes: [ 'form-control-longform' ],
      placeholder: options.placeholder,
    }),
    label,
    validators: stringFieldValidators,
    cssClasses,
  }));
}

/**
 * Create the object representation of our application form.
 *
 * To support client side validation in browsers that don't have sufficient APIs, there is
 * an option to disable file validation.
 */
export function createApplicationForm(validateFile = true) {
  return createForm({
    cv: fileField({
      label: 'Upload your CV.',
      note: 'PDF files only. 2 MB maximum size.',
      required: requiredField,
      validators: validateFile ? [
        fileTypeValidator('application/pdf', 'Please upload a PDF.'),
        fileSizeValidator(exports.maxFieldSize, 'Your CV must be no larger than 2 MB.'),
      ] : [],
      cssClasses,
      row_units: 'three',
    }),
    countryTravellingFrom: fields.string(<FieldParameters>{
      widget: widgets.select(),
      label: 'Where will you be coming from?',
      note: 'This does not have to be your current country of residence.',
      required: requiredField,
      choices: createCountryChoices(),
      cssClasses,
      row_units: 'three',
    }),
    development: fields.array(<FieldParameters>{
      label: 'What role or roles in a team would you be interested in?',
      note: 'Tick all that apply.',
      widget: <any>multiCheckboxWidget(),
      required: requiredField,
      choices: {
        development: 'Development',
        design: 'Design',
        product_management: 'Product Management',
        unknown: 'I’m not sure',
      },
      validators: [
        (form, field, callback) => {
          if ((field.data.includes('unknown')) && (field.data.length > 1)) {
            callback('You can’t have an answer and not be sure!');
          } else {
            callback();
          }
        },
      ],
      cssClasses,
      row_units: 'four',
    }),
    learn: textareaField('What do you want to get out of this event?', 500, {
      note: '<span class="pixel">500 characters or less.</span>',
      required: requiredField,
      row_units: 'four',
    }),
    interests: textareaField('What are you interested in?', 500, {
      note: 'Mention anything you want—it doesn’t have to be technology-related! <span class="pixel">500 characters or less.</span>',
      required: requiredField,
      row_units: 'four',
    }),
    accomplishment: textareaField('Tell us about a recent accomplishment you’re proud of.', 500, {
      note: '<span class="pixel">500 characters or less.</span>',
      required: requiredField,
      row_units: 'four',
    }),
    links: textareaField('Are there any links you’d like to share so we can get to know you better?', 500, { 
      note: 'For example GitHub, LinkedIn or your website. Put each link on a new line. <span class="pixel">500 characters or less.</span>', 
      placeholder: 'https://github.com/hackcambridge',
      validators: [
        (form, field, callback) => {
          if (field.data) {
            const links = field.data.split(/\r?\n/);
            for (const link of links) {
              const isValidURL = validator.isURL(link, {
                allow_underscores: true,
                protocols: ['http', 'https']
              });

              if (!isValidURL) {
                callback('One of these links does not appear to be valid.');
                return;
              }
            }
          }

          callback();
        }
      ],
      row_units: 'four',
    }),
    team: fields.array(<FieldParameters>{
      label: 'Teams',
      note: 'If you’re applying as part of a team now, we won’t process your application until you’ve been entered into a team using the team application form. This can be submitted by any member of the team after every team member has submitted this form.<br>If you’re applying individually, but want to be part of a team, we can suggest a team for you before the event. You can always change team by contacting us.',
      widget: <any>multiCheckboxWidget(),
      choices: {
        team_apply: 'I’m applying as part of a team. One team member will fill out the team application form.',
        team_placement: 'I’m not applying as part of a team, but want to be put in a team.',
      },
      validators: [
        (form, field, callback) => {
          if ((field.data.includes('team_apply')) && (field.data.includes('team_placement'))) {
            callback('You can’t both be in a team and apply to join a team!');
          } else {
            callback();
          }
        },
      ],
      cssClasses,
      row_units: 'four half',
    }),
    confirmations: fields.array(<FieldParameters>{
      label: 'Student status confirmation and terms and conditions',
      note: 'We need confirmation of your student status, and you need to accept the terms and conditions, privacy policy, and the MLH Code of Conduct.<br><a href="/terms-and-conditions" target="_blank">Terms and conditions</a><br><a href="/privacy-policy" target="_blank">Privacy policy</a><br><a href="http://static.mlh.io/docs/mlh-code-of-conduct.pdf" target="_blank">MLH Code of Conduct</a>',
      widget: <any>multiCheckboxWidget(),
      required: validators.required(confirmationAndTermsValidationMessage),
      choices: {
        student_status: `I’m currently a student, or I graduated after ${getEarliestGraduationDateToAccept().format('LL')}.`,
        terms: 'I accept the terms and conditions, privacy policy, and the MLH Code of Conduct.',
      },
      validators: [
        (form, field, callback) => {
          if (!field.data || field.data.length < 2) {
            callback(confirmationAndTermsValidationMessage);
          } else {
            callback();
          }
        },
      ],
      cssClasses,
      row_units: 'four half',
    }),
  }, {
    validatePastFirstError: true,
  });
};