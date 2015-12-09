var asana = require('asana');
var Promise = require("bluebird");
require('dotenv').load();

var AlexaSkill = require('./AlexaSkill');
var AsanaSkillError = require('./AsanaSkillError');

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
  var req = {
    asanaClient: getAsanaClient(session),
    taskNameSlot: intent.slots.TaskName,
    projectNameSlot: intent.slots.ProjectName,
    user: null,
    targetWorkspaceId: null,
    targetProject: null,
    createdTask: null
  };

  // TODO: Handle this by prompting the user for a task name
  if (req.taskNameSlot.value === undefined) {
    var err = new AsanaSkillError('Cannot create a task without a name');
    var speechOutput = speechOutputForError(err);

    console.log(speechOutput.speech);
    response.tell(speechOutput);
    return;
  }

  var createTaskPromise = setUser(req)
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

    console.log(speechText);
    response.tellWithCard(speechOutput, cardTitle, cardContent);
  })
  .catch(function(err) {
    var speechOutput = speechOutputForError(err);

    console.log(speechOutput.speech);
    response.tell(speechOutput);
  });
};

var speechOutputForError = function(err) {
    var errorMessage = "a problem has occurred";

    if (err instanceof AsanaSkillError) {
      errorMessage = err.message;

    } else if (err instanceof asana.errors.InvalidRequest) {
      errorMessage = "the request to Asana was invalid";

    } else if (err instanceof asana.errors.NoAuthorization) {
      errorMessage = "your Asana credentials are missing or expired";

    } else if (err instanceof asana.errors.Forbidden) {
      errorMessage = "the request to Asana wasn't allowed";

    } else if (err instanceof asana.errors.NotFound) {
      errorMessage = "the Asana resource wasn't found";

    } else if (err instanceof asana.errors.RateLimitEnforced) {
      errorMessage = "the request was rate limited by Asana, try again later";

    } else if (err instanceof asana.errors.ServerError) {
      errorMessage = "the Asana server experienced an error";
    }

    var speechText = "I wasn't able to create the task, " + errorMessage + ".";
    var speechOutput = {
      speech: speechText,
      type: AlexaSkill.speechOutputType.PLAIN_TEXT
    };

    return speechOutput;
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
    return Promise.reject(new AsanaSkillError('Cannot create a task without a workspace ID'));
  }

  if (req.taskNameSlot === null || req.taskNameSlot.value === undefined) {
    return Promise.reject(new AsanaSkillError('Cannot create a task without a task name'));
  } else {
    taskOptions.name = req.taskNameSlot.value;
  }

  // Assign to a user if we don't have a project
  if (req.targetProject === null) {
    if (req.user === null) {
      return Promise.reject(new AsanaSkillError('Cannot create a task without a user or project ID'));
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
    return Promise.reject(new AsanaSkillError('Cannot add a project to a task without a task'));
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

// Create the handler that responds to the Alexa Request.
exports.handler = function(event, context) {
  var skill = new AsanaSkill();
  skill.execute(event, context);
};
