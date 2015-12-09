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
         arn: 'arn:aws:lambda:us-east-1:563172112436:function:asanaAlexa'
      }
   },
   lambda_package: {
      default: {
         package: 'AsanaAlexaSkill'
      }
   }
});

grunt.registerTask('deploy', ['lambda_package', 'lambda_deploy'])
