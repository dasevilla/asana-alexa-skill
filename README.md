This is not an official Asana project.

# Develop

Copy `sample.env` to `.env` and fill in the values

To test the event defined in `event.json`, invoke:

    grunt lambda_invoke

To create a package in `dist`:

    grunt lambda_package

To deploy:

    export AWS_ACCESS_KEY_ID=KEY
    export AWS_SECRET_ACCESS_KEY=SECRET
    grunt lambda_deploy

# Configure Alexa Skill

Everything you need can be found in the `speech-assets` directory. When setting up the custom slots, the file name should be the name of the custom slot.
