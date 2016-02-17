(function() {
  'use strict';
  var gdb = angular.module('webIDE.debug.gdb');

  gdb.controller('webIDE.debug.gdb.controller', ['$scope', '$uibModal', 'workspace', function($scope, $uibModal, workspace) {

    var socket = workspace.socket;

    //----------------------------------------------------------------------
    //
    // debugger execution state
    //
    //----------------------------------------------------------------------
    $scope.gdbState = {
      debugStatus: 'idle',
      execStatus: 'stopped',
      interactive: false
    };

    //----------------------------------------------------------------------
    //
    // debugger execution config
    //
    //----------------------------------------------------------------------
    $scope.selectedExecConfig = {
      name: 'main.cc',
      sourceFiles: ['/home/llop/Llop/FIB/TFG/main.cc', '/home/llop/Llop/FIB/TFG/main2.cc'],
      programName: '/home/llop/Llop/FIB/TFG/a.out', 
      programArgs: ['a', 'beef']
    };
    $scope.execConfigs = [$scope.selectedExecConfig];

    //$scope.selectedExecConfig = undefined;
    //$scope.execConfigs = [];

    // Pre: execConfig is in $scope.execConfigs
    $scope.setSelectedExecConfig = function(newSelectedExecConfig) {
      if ($scope.selectedExecConfig===newSelectedExecConfig) return;
      // remove from list, wherever it is + insert first
      $scope.execConfigs = $.grep($scope.execConfigs, function(value) { 
        return value!==newSelectedExecConfig; 
      });
      $scope.execConfigs.unshift(newSelectedExecConfig);
      $scope.selectedExecConfig = newSelectedExecConfig;
    };

    $scope.createExecConfig = function(execConfig) {
      //var execConfig = {
      //  name: name,
      //  sourceFiles: sourceFiles,
      //  programName: programName, 
      //  programArgs: programArgs
      //};
      $scope.execConfigs.unshift(execConfig);
      $scope.selectedExecConfig = execConfig;
    };

    // Pre: execConfig is in $scope.execConfigs
    $scope.deleteExecConfig = function(execConfig) {
      $scope.execConfigs = $.grep($scope.execConfigs, function(value) { 
        return value!==execConfig; 
      });
      if ($scope.selectedExecConfig===execConfig) {
        $scope.selectedExecConfig = $scope.execConfigs.length>0? 
                                    $scope.execConfigs[0] : undefined;
      }
    };

    $scope.openExecConfigModal = function () {
      var modalInstance = $uibModal.open({
        animation: true,
        templateUrl: 'gdb-exec-config-modal-content.html',
        controller: 'GdbExecConfigModalInstanceController',
        size: 'sm'
      });
      modalInstance.result.then(function(newExecConfig) {
        $scope.createExecConfig(newExecConfig);
      }, function () {
        //$log.info('Modal dismissed at: ' + new Date());
      });
    };

    //----------------------------------------------------------------------
    //
    // breakpoints
    //
    //----------------------------------------------------------------------
    //$scope.breakpoints = [];

    $scope.breakpoints = [{filename:'/home/llop/Llop/FIB/TFG/main.cc', line:58, disabled:false}];



    //----------------------------------------------------------------------
    //
    // debugger execution
    //
    //----------------------------------------------------------------------
    $scope.startDebug = function() {
      $scope.gdbState.debugStatus='active';
      // TODO: save source files
      socket.emit('gdb-run', $scope.selectedExecConfig, $scope.breakpoints);
    };
    $scope.pauseDebug = function() {
      socket.emit('gdb-pause');
    };
    $scope.continueDebug = function() {
      socket.emit('gdb-continue');
    };
    $scope.stopDebug = function() {
      socket.emit('gdb-stop');
    };

    //----------------------------------------------------------------------
    //
    // steppin thru instructions
    //
    //----------------------------------------------------------------------
    $scope.stepOver = function() {
      socket.emit('gdb-step-over');
    };
    $scope.stepIn = function() {
      socket.emit('gdb-step-in');
    };
    $scope.stepOut = function() {
      socket.emit('gdb-step-out');
    };


    //----------------------------------------------------------------------
    //
    // app IO
    //
    //----------------------------------------------------------------------
    $scope.gdbAppIn = function(data) {
      socket.emit('gdb-app-in', data);
    };

    socket.on('gdb-app-out', function(data) {
      $scope.$broadcast('gdb-app-out', data);
    });
    
    socket.on('gdb-exec-state-change', function(data) {
      $scope.gdbState.execStatus = data.toString();
    });
    
    socket.on('gdb-debug-state-change', function(data) {
      $scope.gdbState.debugStatus = data.toString();
    });
    
    socket.on('disconnect', function() {
      $scope.$broadcast('socket-disconnect');
    });

    //----------------------------------------------------------------------
    //
    // debug variables
    //
    //----------------------------------------------------------------------
    $scope.gdbVariables = [];
    $scope.gdbChangeVar = function(rowIdx, colIdx, newValue) {
      $scope.gdbVariables[rowIdx].values[colIdx] = newValue;
      // send update up top
      var varName = $scope.gdbVariables[rowIdx].values[0];
      socket.emit('gdb-set-var-value', varName, newValue);
    };

    //----------------------------------------------------------------------
    //
    // debug frames
    //
    //----------------------------------------------------------------------


    //----------------------------------------------------------------------
    //
    // socket setup
    //
    //----------------------------------------------------------------------
    socket.on('gdb-list-variables', function(data) {
      if (data.class=='done') {
        // create data row for editablegrid
        var listData = [];
        for (var i=0; i<data.result.variables.length; ++i) {
          var variable = data.result.variables[i];
          var values = [variable.name, variable.type, variable.value||('('+variable.type+')')];
          listData.push({id: i+1, values: values});
        }
        $scope.gdbVariables = listData;
      }
    });
  }]);


  gdb.controller('GdbExecConfigModalInstanceController', ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
    $scope.execConfig = {
      name: 'coco',
      sourceFiles: ['any.cc'],
      programName: 'coco', 
      programArgs: ['none','some']
    };
    $scope.ok = function () {
      $uibModalInstance.close($scope.execConfig);
    };
    $scope.cancel = function () {
      $uibModalInstance.dismiss('cancel');
    };
  }]);

})();
    