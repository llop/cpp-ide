(function() {
  'use strict';
  var gdb = angular.module('webIDE.debug.gdb');
  gdb.directive('gdbTerm', [function() {
      return {
        restrict: 'A',
        scope: {
          gdbAppIn: '&'
        },
        link: function(scope, element, attrs) {
          var term = new Terminal({
            cols: 80,
            rows: 24,
            screenKeys: true,
            cursorBlink: false
          });
          term.on('data', function(data) {
            scope.gdbAppIn({data: data});
          });
          term.open(element[0]);
          scope.$on('gdb-app-out', function(event, data) {
            term.write(data);
          });
          scope.$on('socket-disconnect', function(event) {
            term.destroy();
          });
        }
      };
  }]);
  gdb.directive('gdbVariables', [function() {
    return {
      restrict: 'A',
      scope: {
        id: '@',
        class: '@',
        gdbVariables: '=',
        gdbChangeVar: '&'
      },
      link: function(scope, element, attrs) {
        // editablegrid init
        var editableGrid = new EditableGrid("gdb-vars-grid", {
          modelChanged: function(rowIdx, colIdx, oldValue, newValue, row) {
            // hook into the modelChange event
            scope.gdbChangeVar({rowIdx: rowIdx, colIdx: colIdx, newValue: newValue});
          }
        });
        // columns
        var metadata = [];
        metadata.push({ name: "name", label: "Name", datatype: "string", editable: false});
        metadata.push({ name: "type", label: "Type", datatype: "string", editable: false});
        metadata.push({ name: "value", label:"Value", datatype: "string", editable: true});
        editableGrid.load({"metadata": metadata});
        // repaint every time we get new variables data
        scope.$watch(function() { return scope.gdbVariables; }, function(newValue, oldValue) {
          editableGrid.load({"data": newValue});
          editableGrid.renderGrid(scope.id, scope.class);
        });
      }
    };
  }]);
})();