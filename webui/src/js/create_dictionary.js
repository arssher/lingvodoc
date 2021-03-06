var app = angular.module('CreateDictionaryModule', ['ui.router', 'ui.bootstrap']);

app.service('dictionaryService', lingvodocAPI);

app.config(function($stateProvider, $urlRouterProvider) {

    $stateProvider

        .state('create', {
            url: '/create',
            templateUrl: 'createDictionary.html',
            controller: 'CreateDictionaryController'
        })

        .state('create.step1', {
            url: '/step1',
            templateUrl: 'createDictionaryStep1.html'
        })

        .state('create.step2', {
            url: '/step2',
            templateUrl: 'createDictionaryStep2.html'
        })

        .state('create.step3', {
            url: '/step3',
            templateUrl: 'createDictionaryStep3.html'
        });

    $urlRouterProvider.otherwise('/create/step1');
});

app.factory('responseHandler', ['$timeout', '$modal', responseHandler]);

app.controller('CreateDictionaryController', ['$scope', '$http', '$modal', '$interval', '$state', '$window', '$log', 'dictionaryService', 'responseHandler', function($scope, $http, $modal, $interval, $state, $window, $log, dictionaryService, responseHandler) {

    var clientId = $('#clientId').data('lingvodoc');
    var userId = $('#userId').data('lingvodoc');
    var languagesUrl = $('#languagesUrl').data('lingvodoc');
    var createLanguageUrl = $('#createLanguageUrl').data('lingvodoc');
    var createDictionaryUrl = $('#createDictionaryUrl').data('lingvodoc');
    var allPerspectivesUrl = $('#allPerspectivesUrl').data('lingvodoc');
    var perspectiveFieldsUrl = '/dictionary';
    var listBlobsUrl = $('#listBlobsUrl').data('lingvodoc');

    $scope.wizard = {
        'mode': 'create',
        'importedDictionaryId': -1
    };

    $scope.users = [];
    $scope.userLogins = [];
    $scope.uploadedDictionaries = [];


    var flatLanguages = function(languages) {
        var flat = [];
        for (var i = 0; i < languages.length; i++) {
            var language = languages[i];
            flat.push(languages[i]);
            if (language.contains && language.contains.length > 0) {
                var childLangs = flatLanguages(language.contains);
                flat = flat.concat(childLangs);
            }
        }
        return flat;
    };

    var getLanguageById = function(id) {
        if (typeof id == 'string') {
            var ids = id.split('_');
            for (var i = 0; i < $scope.languages.length; i++) {
                if ($scope.languages[i].client_id == ids[0] && $scope.languages[i].object_id == ids[1])

                    return $scope.languages[i];
            }
        }
    };

    // Data loaded from backend
    $scope.languages = [];
    $scope.perspectives = [];


    $scope.dictionaryData = {
        'languageId': -1,
        'perspectiveName': '',
        'perspectiveId': -1,
        'isTemplate': false

    };
    // current perspective
    $scope.perspective = {
        fields: []
    };

    $scope.controls = {
        'createDictionary': true,
        'createPerspective': true,
        'saveDictionary': true
    };

    // Event handlers

    $scope.getLanguageId = function(language) {
        if (language) {
            return language.client_id + '_' + language.object_id;
        }
    };

    $scope.newLanguage = function() {
        var modalInstance = $modal.open({
            animation: true,
            templateUrl: 'createLanguageModal.html',
            controller: 'CreateLanguageController',
            size: 'lg'
        });

        modalInstance.result.then(function(languageObj) {
            $http.post(createLanguageUrl, languageObj).success(function(data, status, headers, config) {
                loadLanguages();
            }).error(function(data, status, headers, config) {
                alert('Failed to save language!');
            });
        }, function() {
        });
    };

    $scope.addField = function() {
        $scope.perspective.fields.push({
            'entity_type': '',
            'entity_type_translation': '',
            'data_type': 'text',
            'data_type_translation': 'text',
            'status': 'enabled'
        });
    };

    $scope.enableGroup = function(fieldIndex) {
        if (typeof $scope.perspective.fields[fieldIndex].group === 'undefined') {
            $scope.perspective.fields[fieldIndex].group = '';
        } else {
            delete $scope.perspective.fields[fieldIndex].group;
        }
    };

    $scope.enableLinkedField = function(fieldIndex) {
        if (typeof $scope.perspective.fields[fieldIndex].contains === 'undefined') {
            $scope.perspective.fields[fieldIndex].contains = [{
                'entity_type': '',
                'entity_type_translation': '',
                'data_type': 'markup',
                'data_type_translation': 'markup',
                'status': 'enabled'
            }];
        } else {
            delete $scope.perspective.fields[fieldIndex].contains;
        }
    };

    var convert = function(req) {
        dictionaryService.convertDictionary(req).then(function(response) {
            responseHandler.success(response);
            $window.location.href = '/dashboard';
        }, function(reason) {
            responseHandler.error(reason);
        });
    };

    // Save dictionary
    $scope.createDictionary = function() {

        var language = getLanguageById($scope.dictionaryData.languageId);
        if ((!$scope.dictionaryData.name && $scope.wizard.mode == 'create') || (typeof $scope.wizard.importedDictionaryId != 'string' && $scope.wizard.mode == 'import') || !language) {
            return;
        }

        if ($scope.wizard.mode == 'create') {

            var dictionaryObj = {
                'parent_client_id': language.client_id,
                'parent_object_id': language.object_id,
                'translation_string': $scope.dictionaryData.name,
                'translation': $scope.dictionaryData.name
            };

            $scope.controls.createDictionary = false;

            $http.post(createDictionaryUrl, dictionaryObj).success(function(data, status, headers, config) {

                if (data.object_id && data.client_id) {
                    $scope.dictionaryData.dictionary_client_id = data.client_id;
                    $scope.dictionaryData.dictionary_object_id = data.object_id;
                    $scope.controls.createDictionary = true;
                    $state.go('create.step2');
                } else {
                    responseHandler.error('Failed to create dictionary!');
                }
                $scope.controls.createDictionary = true;

            }).error(function(data, status, headers, config) {
                $scope.controls.createDictionary = true;
                responseHandler.error('Failed to create dictionary!');
            });
        }


        if ($scope.wizard.mode == 'import') {

            if (typeof $scope.wizard.importedDictionaryId == 'string') {

                $scope.controls.createDictionary = false;

                var blob = _.find($scope.uploadedDictionaries, function(d) {
                    return d.getId() == $scope.wizard.importedDictionaryId;
                });

                dictionaryService.checkDictionaryBlob(blob, language).then(function(perspectives) {

                    if (_.size(perspectives) > 0) {

                        $modal.open({
                            animation: true,
                            templateUrl: 'importModal.html',
                            controller: 'ImportController',
                            size: 'lg',
                            backdrop: 'static',
                            keyboard: false,
                            resolve: {
                                'params': function() {
                                    return {
                                        'perspectives': perspectives,
                                        'blob': blob,
                                        'language': language
                                    };
                                }
                            }
                        }).result.then(function(req) {
                                convert(req);
                            }, function() {

                            });
                    } else {
                        convert({
                            'blob_client_id': blob.client_id,
                            'blob_object_id': blob.object_id,
                            'parent_client_id': language.client_id,
                            'parent_object_id': language.object_id
                        });
                    }
                }, function(reason) {
                    responseHandler.error(reason);
                });
            }
        }
    };

    // Save perspective
    $scope.createPerspective = function() {

        if (!$scope.dictionaryData.perspectiveName) {
            return;
        }

        var createPerspectiveUrl = '/dictionary/' + encodeURIComponent($scope.dictionaryData.dictionary_client_id) + '/' + encodeURIComponent($scope.dictionaryData.dictionary_object_id) + '/' + 'perspective';
        var perspectiveObj = {
            'translation_string': $scope.dictionaryData.perspectiveName,
            'translation': $scope.dictionaryData.perspectiveName,
            'is_template': $scope.dictionaryData.isTemplate
        };

        $scope.controls.createPerspective = false;

        $http.post(createPerspectiveUrl, perspectiveObj).success(function(data, status, headers, config) {

            if (data.object_id && data.client_id) {
                $scope.dictionaryData.perspective_client_id = data.client_id;
                $scope.dictionaryData.perspective_object_id = data.object_id;
                var setFieldsUrl = '/dictionary/' + encodeURIComponent($scope.dictionaryData.dictionary_client_id) + '/' + encodeURIComponent($scope.dictionaryData.dictionary_object_id) + '/perspective/' + encodeURIComponent($scope.dictionaryData.perspective_client_id) + '/' + encodeURIComponent($scope.dictionaryData.perspective_object_id) + '/fields';

                $http.post(setFieldsUrl, exportPerspective($scope.perspective)).success(function(data, status, headers, config) {
                    $scope.controls.createPerspective = true;
                    window.location = '/dashboard';
                }).error(function(data, status, headers, config) {
                    $scope.controls.createPerspective = true;
                    responseHandler.error('Failed to create perspective!');
                });

            } else {
                $scope.controls.createPerspective = true;
                responseHandler.error('Failed to create perspective!');
            }

        }).error(function(data, status, headers, config) {
            $scope.controls.createPerspective = true;
            responseHandler.error('Failed to create perspective!');
        });

    };


    $scope.searchUsers = function(query) {
        var promise = $http.get('/users?search=' + encodeURIComponent(query)).then(function(response) {
            return response.data;
        });
        promise.then(function(data) {
            var userLogins = [];
            if (data.users) {
                for (var i = 0; i < data.users.length; i++) {
                    var user = data.users[i];
                    userLogins.push(user.login);
                }

                $scope.userLogins = userLogins;
                $scope.users = data.users;
            }
        });
    };


    $scope.addUser = function(userLogin) {

    };

    // Load data from backend

    // Load list of languages
    var loadLanguages = function() {
        $http.get(languagesUrl).success(function(data, status, headers, config) {
            $scope.languages = flatLanguages(data.languages);
        }).error(function(data, status, headers, config) {
            // error handling
        });
    };

    $scope.$watch('dictionaryData.perspectiveId', function(id) {
        if (typeof id == 'string') {
            for (var i = 0; i < $scope.perspectives.length; i++) {
                if ($scope.perspectives[i].getId() == id) {
                    $scope.perspective = $scope.perspectives[i];

                    dictionaryService.getPerspectiveFieldsNew($scope.perspective).then(function(fields) {
                        $scope.perspective.fields = fields;
                    }, function(reason) {
                        responseHandler.error(reason);
                    });
                    break;
                }
            }
        }
    });

    dictionaryService.getAllPerspectives().then(function(perspectives) {
        $scope.perspectives = perspectives;
    }, function(reason) {
        responseHandler.error(reason);
    });


    loadLanguages();

    dictionaryService.getUserBlobs().then(function(blobs) {

        $scope.uploadedDictionaries = _.filter(blobs, function(e) {
            return e.data_type == 'dialeqt_dictionary';
        });

    }, function(reason) {
        responseHandler.error(reason);
    });

}]);


app.controller('CreateLanguageController', ['$scope', '$http', '$interval', '$modalInstance', 'responseHandler', function($scope, $http, $interval, $modalInstance, responseHandler) {

    var clientId = $('#clientId').data('lingvodoc');
    var userId = $('#userId').data('lingvodoc');
    var languagesUrl = $('#languagesUrl').data('lingvodoc');
    var createLanguageUrl = $('#createLanguageUrl').data('lingvodoc');

    $scope.languages = [];
    $scope.parentLanguageId = -1;
    $scope.translation = '';
    $scope.translationString = '';

    var getLanguageById = function(id) {
        var ids = id.split('_');
        for (var i = 0; i < $scope.languages.length; i++) {
            if ($scope.languages[i].client_id == ids[0] && $scope.languages[i].object_id == ids[1])
                return $scope.languages[i];
        }
    };

    var flatLanguages = function(languages) {
        var flat = [];
        for (var i = 0; i < languages.length; i++) {
            var language = languages[i];
            flat.push(languages[i]);
            if (language.contains && language.contains.length > 0) {
                var childLangs = flatLanguages(language.contains);
                flat = flat.concat(childLangs);
            }
        }
        return flat;
    };

    $scope.getLanguageId = function(language) {
        if (language) {
            return language.client_id + '_' + language.object_id;
        }
    };

    $scope.ok = function() {

        if (!$scope.translation) {
            return;
        }

        var languageObj = {
            'translation': $scope.translation,
            'translation_string': $scope.translation
        };

        if ($scope.parentLanguageId != '-1') {
            var parentLanguage = getLanguageById($scope.parentLanguageId);
            if (parentLanguage) {
                languageObj['parent_client_id'] = parentLanguage.client_id;
                languageObj['parent_object_id'] = parentLanguage.object_id;
            }
        }

        $modalInstance.close(languageObj);
    };

    $scope.cancel = function() {
        $modalInstance.dismiss('cancel');
    };

    $http.get(languagesUrl).success(function(data, status, headers, config) {
        $scope.languages = flatLanguages(data.languages);
    }).error(function(data, status, headers, config) {
        // error handling
    });
}]);

app.controller('ImportController', ['$scope', '$http', '$q', '$log', '$modalInstance', 'dictionaryService', 'responseHandler', 'params', function($scope, $http, $q, $log, $modalInstance, dictionaryService, responseHandler, params) {

    $scope.mode = 'create';
    $scope.perspectives = params.perspectives;
    $scope.paths = [];
    $scope.import = {};
    $scope.import.dictionaryId = '';
    $scope.import.perspectiveId = '';
    $scope.import.createNewPerspective = false;


    var getSelectedPerspective = function() {
        return _.find($scope.perspectives, function(e) {
            return e.getId() === $scope.import.perspectiveId;
        });
    };

    var getSelectedDictionary = function() {
        return _.find($scope.dictionaries, function(e) {
            return e.getId() === $scope.import.dictionaryId;
        });
    };

    $scope.ok = function() {

        var req = {
            'blob_client_id': params.blob.client_id,
            'blob_object_id': params.blob.object_id,
            'parent_client_id': params.language.client_id,
            'parent_object_id': params.language.object_id
        };

        if ($scope.mode === 'import') {

            var dictionary = getSelectedDictionary();
            if (dictionary) {

                req.dictionary_client_id = dictionary.client_id;
                req.dictionary_object_id = dictionary.object_id;

                if (!$scope.import.createNewPerspective) {

                    var perspective = getSelectedPerspective();
                    if (perspective) {
                        req.perspective_client_id = perspective.client_id;
                        req.perspective_object_id = perspective.object_id;
                    } else {
                        responseHandler.error('Please, select perspective.');
                        return;
                    }
                }
            } else {
                responseHandler.error('Please, select dictionary.');
                return;
            }
        }
        $modalInstance.close(req);
    };

    $scope.cancel = function() {
        $modalInstance.dismiss('cancel');
    };


    $scope.$watch('import.dictionaryId', function(id) {

        var dictionary = _.find($scope.dictionaries, function(d) {
            return d.getId() === id;
        });

        if (dictionary) {
            $scope.perspectives = _.filter(params.perspectives, function(p) {
                return p.parent_client_id == dictionary.client_id && p.parent_object_id == dictionary.object_id;
            });
        }
    });

    // load list of dictionaries
    var r = params.perspectives.map(function(perspective) {
        return dictionaryService.getPerspectiveOriginById(perspective.client_id, perspective.parent_object_id);
    });

    $q.all(r).then(function(paths) {
        $scope.paths = paths;
        var dictionaries = _.reduce(paths, function(acc, path) {
            var pathDicts = _.filter(path, function(e) {
                return e.type === 'dictionary';
            });
            _.each(pathDicts, function(d) {
                acc.push(d);
            });

            return acc;
        }, []);

        // remove duplicates
        $scope.dictionaries = _.uniq(dictionaries, function(d, key, a) {
            return d.getId();
        });

    }, function(reason) {
        responseHandler.error(reason);
    });


}]);




