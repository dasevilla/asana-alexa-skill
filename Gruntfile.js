require('dotenv').load();
var grunt = require('grunt');
grunt.loadNpmTasks('grunt-aws-lambda');

grunt.initConfig({
   lambda_invoke: {
      default: {
         options: {
            file_name: 'AsanaAlexaSkill.js'
         }
      }
   },
   lambda_deploy: {
      default: {
         package: 'AsanaAlexaSkill',
         arn: process.env.AMAZON_LAMBDA_ARN
      }
   },
   lambda_package: {
      default: {
         package: 'AsanaAlexaSkill'
      }
   }
});

grunt.registerTask('deploy', ['lambda_package', 'lambda_deploy'])
