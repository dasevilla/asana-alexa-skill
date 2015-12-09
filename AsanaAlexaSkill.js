var asana = require('asana');
var Promise = require("bluebird");
require('dotenv').load();

var AlexaSkill = require('./AlexaSkill');

var ALEXA_APP_ID = process.env.ALEXA_APP_ID;
var ASANA_ACCESS_TOKEN = process.env.ASANA_ACCESS_TOKEN;
var ASANA_DEFAULT_WORKSPACE_ID = process.env.ASANA_DEFAULT_WORKSPACE_ID;

var AsanaSkill = function() {
  AlexaSkill.call(this, ALEXA_APP_ID);
};

// Extend AlexaSkill
AsanaSkill.prototype = Object.create(AlexaSkill.prototype);
AsanaSkill.prototype.constructor = AlexaSkill;

/**
 * Overriden to show that a subclass can override this function to initialize session state.
 */
AsanaSkill.prototype.eventHandlers.onSessionStarted = function(sessionStartedRequest, session) {
  console.log("onSessionStarted requestId: " + sessionStartedRequest.requestId
    + ", sessionId: " + session.sessionId);

  // Any session init logic would go here.
};

/**
 * If the user launches without specifying an intent, route to the correct function.
 */
AsanaSkill.prototype.eventHandlers.onLaunch = function(launchRequest, session, response) {
  console.log("AsanaSkill onLaunch requestId: " + launchRequest.requestId + ", sessionId: " + session.sessionId);

  handleCreateTaskIntent(session, response);
};

/**
 * Overriden to show that a subclass can override this function to teardown session state.
 */
AsanaSkill.prototype.eventHandlers.onSessionEnded = function(sessionEndedRequest, session) {
  console.log("onSessionEnded requestId: " + sessionEndedRequest.requestId
    + ", sessionId: " + session.sessionId);

  //Any session cleanup logic would go here.
};

AsanaSkill.prototype.intentHandlers = {
  "CreateTaskIntent": function(intent, session, response) {
    CreateTaskIntent(intent, session, response);
  },

  "AMAZON.HelpIntent": function(intent, session, response) {
    var speechText = "You can ask to a task to a list";

    var speechOutput = {
      speech: speechText,
      type: AlexaSkill.speechOutputType.PLAIN_TEXT
    };
    var repromptOutput = {
      speech: speechText,
      type: AlexaSkill.speechOutputType.PLAIN_TEXT
    };

    // For the repromptText, play the speechOutput again
    response.ask(speechOutput, repromptOutput);
  },

  "AMAZON.StopIntent": function(intent, session, response) {
    var speechOutput = "Goodbye";
    response.tell(speechOutput);
  },

  "AMAZON.CancelIntent": function(intent, session, response) {
    var speechOutput = "Goodbye";
    response.tell(speechOutput);
  }
};

var CreateTaskIntent = function(intent, session, response) {
  var taskCreateRequest = {
    asanaClient: getAsanaClient(),
    taskNameSlot: intent.slots.TaskName,
    projectNameSlot: intent.slots.ProjectName,
    user: null,
    targetWorkspaceId: null,
    targetProject: null,
    createdTask: null
  };

  // if there's not a task name, return an error

  // Find the current user
  var createTaskPromise = setUser(taskCreateRequest)
  .then(setTargetWorkspaceId)
  .then(setTargetProject)
  .then(createTask)
  .then(addProjectToTask)
  .then(function(req) {
    var createdInName = req.createdTask.workspace.name;
    if (req.targetProject !== null) {
      createdInName = req.targetProject.name;
    }

    var speechText = "I've added that task to " + createdInName + ".";
    var speechOutput = {
      speech: speechText,
      type: AlexaSkill.speechOutputType.PLAIN_TEXT
    };

    var cardTitle = "Created task in Asana";
    var cardContent = req.createdTask.name + " added to " + createdInName;

    response.tellWithCard(speechOutput, cardTitle, cardContent);
  });
};

var setUser = function(req) {
  return req.asanaClient.users.me().then(function(user){
    req.user = user;
    return Promise.resolve(req);
  });
};

var setTargetWorkspaceId = function(req) {
  return getDefaultWorkspaceForUser().then(function(workspaceId){
    req.targetWorkspaceId = workspaceId;
    return Promise.resolve(req);
  });
};

var setTargetProject = function(req) {
  if (req.projectNameSlot.value === undefined) {
    req.targetProject = null;
    return Promise.resolve(req);
  }

  return findProjectInWorkspace(req.asanaClient, req.targetWorkspaceId, req.projectNameSlot.value).then(function(project){
    req.targetProject = project;
    return Promise.resolve(req);
  });
};

var createTask = function(req) {
  var taskOptions = {};

  if (req.targetWorkspaceId === null) {
    return Promise.reject(new Error('Cannot create a task without a workspace ID'));
  }

  if (req.taskNameSlot === null || req.taskNameSlot.value === undefined) {
    return Promise.reject(new Error('Cannot create a task without a task name'));
  } else {
    taskOptions.name = req.taskNameSlot.value;
  }

  // Assign to a user if we don't have a project
  if (req.targetProject === null) {
    if (req.user === null) {
      return Promise.reject(new Error('Cannot create a task without a user or project ID'));
    }
    taskOptions.assignee = req.user.id;
  }

  return req.asanaClient.tasks.createInWorkspace(req.targetWorkspaceId,
    taskOptions).then(function(task) {
      req.createdTask = task;
      return Promise.resolve(req);
    });
};

var addProjectToTask = function(req) {
  if (req.targetWorkspaceId === null) {
    return Promise.reject(new Error('Cannot add a project to a task without a task'));
  }

  if (req.targetProject === null) {
    return Promise.resolve(req);
  }

  return req.asanaClient.tasks.addProject(req.createdTask.id, {
    project: req.targetProject.id
  }).then(function() {
    return Promise.resolve(req);
  });
};

var getDefaultWorkspaceForUser = function(user) {
  if (ASANA_DEFAULT_WORKSPACE_ID !== null) {
    return Promise.resolve(ASANA_DEFAULT_WORKSPACE_ID);
  } else {
    return Promise.resolve(user.workspaces[0].id);
  }
};

/**
 * Attempt a best-guess for an Asana project in the specified workspace.
 */
var findProjectInWorkspace = function(asanaClient, workspaceId, queryString) {
  return asanaClient.workspaces.typeahead(workspaceId, {
      type: 'project',
      query: queryString,
      count: 1
    }).then(function(result) {
      if (result.data.length > 0) {
        return Promise.resolve(result.data[0]);
      } else {
        return Promise.resolve(null);
      }
    });
};

var getAsanaClient = function(session) {
  var client = asana.Client.create();
  if (!session || !session.user || !session.user.accessToken) {
    return client.useAccessToken(ASANA_ACCESS_TOKEN);
  } else {
    return client.useOauth({
      credentials: session.user.accessToken
    });
  }
};

var asanaUser = {
  getUserPromise: null,

  get: function(asanaClient) {
    var that = this;

    if (this.getUserPromise === null) {
      this.getUserPromise = asanaClient.users.me();

      this.getUserPromise.catch(function() {
        asanaClient.users.me().getUserPromise = null;
      });
    }

    return this.getUserPromise;
  }
};

// Create the handler that responds to the Alexa Request.
exports.handler = function(event, context) {
  var skill = new AsanaSkill();
  skill.execute(event, context);
};
