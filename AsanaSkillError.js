var util = require('util');

var AsanaSkillError = function(message) {
  this.message = message;
};

util.inherits(AsanaSkillError, Error);

module.exports = AsanaSkillError;
