/*************************************************
 * Copyright (c) 2016 Ansible, Inc.
 *
 * All Rights Reserved
 *************************************************/

export default ['$state', '$stateParams', '$scope', 'ParseVariableString',
    'rbacUiControlService', 'ToJSON', 'ParseTypeChange', 'GroupsService',
    'GetChoices', 'GetBasePath', 'CreateSelect2', 'GetSourceTypeOptions',
    'inventorySourceData', 'SourcesService', 'inventoryData', 'inventorySourcesOptions', 'Empty',
    'Wait', 'Rest', 'Alert', 'ProcessErrors',
    function($state, $stateParams, $scope, ParseVariableString,
        rbacUiControlService, ToJSON,ParseTypeChange, GroupsService,
        GetChoices, GetBasePath, CreateSelect2, GetSourceTypeOptions,
        inventorySourceData, SourcesService, inventoryData, inventorySourcesOptions, Empty,
        Wait, Rest, Alert, ProcessErrors) {

        function init() {
            $scope.projectBasePath = GetBasePath('projects');
            $scope.canAdd = inventorySourcesOptions.actions.POST;
            // instantiate expected $scope values from inventorySourceData
            _.assign($scope,
                {credential: inventorySourceData.credential},
                {overwrite: inventorySourceData.overwrite},
                {overwrite_vars: inventorySourceData.overwrite_vars},
                {update_on_launch: inventorySourceData.update_on_launch},
                {update_cache_timeout: inventorySourceData.update_cache_timeout},
                {instance_filters: inventorySourceData.instance_filters},
                {inventory_script: inventorySourceData.source_script},
                {verbosity: inventorySourceData.verbosity});

            $scope.inventory_source_obj = inventorySourceData;
            if (inventorySourceData.credential) {
                $scope.credential_name = inventorySourceData.summary_fields.credential.name;
            }

            if(inventorySourceData.source === 'scm') {
                $scope.project = inventorySourceData.source_project;
                $scope.project_name = inventorySourceData.summary_fields.source_project.name;
                updateSCMProject();
            }

            // display custom inventory_script name
            if (inventorySourceData.source === 'custom' && inventorySourceData.summary_fields.source_script) {
                $scope.inventory_script_name = inventorySourceData.summary_fields.source_script.name;
            }
            $scope = angular.extend($scope, inventorySourceData);

            $scope.$watch('summary_fields.user_capabilities.edit', function(val) {
                $scope.canAdd = val;
            });

            $scope.$on('sourceTypeOptionsReady', function() {
                initSourceSelect();
            });

            $scope.envParseType = 'yaml';

            initSources();

            GetChoices({
                scope: $scope,
                field: 'verbosity',
                variable: 'verbosity_options',
                options: inventorySourcesOptions
            });

            var i;
            for (i = 0; i < $scope.verbosity_options.length; i++) {
                if ($scope.verbosity_options[i].value === $scope.verbosity) {
                    $scope.verbosity = $scope.verbosity_options[i];
                }
            }

            initVerbositySelect();

            $scope.$watch('verbosity', initVerbositySelect);

            // Register a watcher on project_name
            if ($scope.getInventoryFilesUnregister) {
                $scope.getInventoryFilesUnregister();
            }
            $scope.getInventoryFilesUnregister = $scope.$watch('project', function (newValue, oldValue) {
                if (newValue !== oldValue) {
                    updateSCMProject();
                }
            });
        }

        function initVerbositySelect(){
            CreateSelect2({
                element: '#inventory_source_verbosity',
                multiple: false
            });
        }

        function sync_inventory_file_select2() {
            CreateSelect2({
                element:'#inventory-file-select',
                addNew: true,
                multiple: false,
                scope: $scope,
                options: 'inventory_files',
                model: 'inventory_file'
            });

            // TODO: figure out why the inventory file model is being set to
            // dirty
        }

        function updateSCMProject() {
            var url;

            if (!Empty($scope.project)) {
                url = GetBasePath('projects') + $scope.project + '/inventories/';
                Wait('start');
                Rest.setUrl(url);
                Rest.get()
                    .success(function (data) {
                        $scope.inventory_files = data;
                        $scope.inventory_files.push("/ (project root)");

                        if (inventorySourceData.source_path !== "") {
                            $scope.inventory_file = inventorySourceData.source_path;
                            if ($scope.inventory_files.indexOf($scope.inventory_file) < 0) {
                                $scope.inventory_files.push($scope.inventory_file);
                            }
                        } else {
                            $scope.inventory_file = "/ (project root)";
                        }
                        sync_inventory_file_select2();
                        Wait('stop');
                    })
                    .error(function () {
                        Alert('Cannot get inventory files', 'Unable to retrieve the list of inventory files for this project.', 'alert-info');
                        Wait('stop');
                    });
            }

            if (!Empty($scope.project)) {
                Rest.setUrl(GetBasePath('projects') + $scope.project + '/');
                Rest.get()
                    .success(function (data) {
                        var msg;
                        switch (data.status) {
                        case 'failed':
                            msg = "<div>The Project selected has a status of \"failed\". You must run a successful update before you can select an inventory file.";
                            break;
                        case 'never updated':
                            msg = "<div>The Project selected has a status of \"never updated\". You must run a successful update before you can select an inventory file.";
                            break;
                        case 'missing':
                            msg = '<div>The selected project has a status of \"missing\". Please check the server and make sure ' +
                                ' the directory exists and file permissions are set correctly.</div>';
                            break;
                        }
                        if (msg) {
                            Alert('Warning', msg, 'alert-info alert-info--noTextTransform', null, null, null, null, true);
                        }
                    })
                    .error(function (data, status) {
                        ProcessErrors($scope, data, status, null, { hdr: 'Error!',
                            msg: 'Failed to get project ' + $scope.project + '. GET returned status: ' + status });
                    });
            }
        }

        function initSourceSelect() {
            $scope.source = _.find($scope.source_type_options, { value: inventorySourceData.source });
            var source = $scope.source && $scope.source.value ? $scope.source.value : null;

            CreateSelect2({
                element: '#inventory_source_source',
                multiple: false
            });

            if (source === 'ec2' || source === 'custom' ||
                source === 'vmware' || source === 'openstack' ||
                source === 'scm') {

                var varName;
                if (source === 'scm') {
                    varName = 'custom_variables';
                } else {
                    varName = source + '_variables';
                }

                $scope[varName] = $scope[varName] === (null || undefined) ? '---' : $scope[varName];

                ParseVariableString(inventorySourceData.source_vars);
                ParseTypeChange({
                    scope: $scope,
                    field_id: varName,
                    variable: varName,
                    parse_variable: 'envParseType',
                });
            }
        }

        function initRegionData() {
            var source = $scope.source === 'azure_rm' ? 'azure' : $scope.source;
            var regions = inventorySourceData.source_regions.split(',');
            // azure_rm regions choices are keyed as "azure" in an OPTIONS request to the inventory_sources endpoint
            $scope.source_region_choices = $scope[source + '_regions'];

            // the API stores azure regions as all-lowercase strings - but the azure regions received from OPTIONS are Snake_Cased
            if (source === 'azure') {
                $scope.source_regions = _.map(regions, (region) => _.find($scope[source + '_regions'], (o) => o.value.toLowerCase() === region));
            }
            // all other regions are 1-1
            else {
                $scope.source_regions = _.map(regions, (region) => _.find($scope[source + '_regions'], (o) => o.value === region));
            }
            initRegionSelect();
        }

        function initSources() {
            GetSourceTypeOptions({
                scope: $scope,
                variable: 'source_type_options'
            });
            GetChoices({
                scope: $scope,
                field: 'source_regions',
                variable: 'rax_regions',
                choice_name: 'rax_region_choices',
                options: inventorySourcesOptions
            });
            GetChoices({
                scope: $scope,
                field: 'source_regions',
                variable: 'ec2_regions',
                choice_name: 'ec2_region_choices',
                options: inventorySourcesOptions
            });
            GetChoices({
                scope: $scope,
                field: 'source_regions',
                variable: 'gce_regions',
                choice_name: 'gce_region_choices',
                options: inventorySourcesOptions
            });
            GetChoices({
                scope: $scope,
                field: 'source_regions',
                variable: 'azure_regions',
                choice_name: 'azure_region_choices',
                options: inventorySourcesOptions
            });
            GetChoices({
                scope: $scope,
                field: 'group_by',
                variable: 'ec2_group_by',
                choice_name: 'ec2_group_by_choices',
                options: inventorySourcesOptions
            });

            initRegionData();
        }

        function initRegionSelect() {
            CreateSelect2({
                element: '#inventory_source_source_regions',
                multiple: true
            });

            initGroupBySelect();
        }

        function initGroupBySelect(){
            var add_new = false;
            if($scope && $scope.source && $scope.source === 'ec2' || $scope && $scope.source && $scope.source.value  && $scope.source.value === 'ec2'){
                $scope.group_by_choices = $scope.ec2_group_by;
                let group_by = inventorySourceData.group_by.split(',');
                $scope.group_by = _.map(group_by, (item) => _.find($scope.ec2_group_by, { value: item }));
                $scope.groupByPopOver = "<p>Select which groups to create automatically. " +
                    "Tower will create group names similar to the following examples based on the options selected:</p><ul>" +
                    "<li>Availability Zone: <strong>zones &raquo; us-east-1b</strong></li>" +
                    "<li>Image ID: <strong>images &raquo; ami-b007ab1e</strong></li>" +
                    "<li>Instance ID: <strong>instances &raquo; i-ca11ab1e</strong></li>" +
                    "<li>Instance Type: <strong>types &raquo; type_m1_medium</strong></li>" +
                    "<li>Key Name: <strong>keys &raquo; key_testing</strong></li>" +
                    "<li>Region: <strong>regions &raquo; us-east-1</strong></li>" +
                    "<li>Security Group: <strong>security_groups &raquo; security_group_default</strong></li>" +
                    "<li>Tags: <strong>tags &raquo; tag_Name &raquo; tag_Name_host1</strong></li>" +
                    "<li>VPC ID: <strong>vpcs &raquo; vpc-5ca1ab1e</strong></li>" +
                    "<li>Tag None: <strong>tags &raquo; tag_none</strong></li>" +
                    "</ul><p>If blank, all groups above are created except <em>Instance ID</em>.</p>";
                $scope.instanceFilterPopOver = "<p>Provide a comma-separated list of filter expressions. " +
                    "Hosts are imported to Tower when <em>ANY</em> of the filters match.</p>" +
                    "Limit to hosts having a tag:<br />\n" +
                    "<blockquote>tag-key=TowerManaged</blockquote>\n" +
                    "Limit to hosts using either key pair:<br />\n" +
                    "<blockquote>key-name=staging, key-name=production</blockquote>\n" +
                    "Limit to hosts where the Name tag begins with <em>test</em>:<br />\n" +
                    "<blockquote>tag:Name=test*</blockquote>\n" +
                    "<p>View the <a href=\"http://docs.aws.amazon.com/AWSEC2/latest/APIReference/ApiReference-query-DescribeInstances.html\" target=\"_blank\">Describe Instances documentation</a> " +
                    "for a complete list of supported filters.</p>";

            }
            if($scope && $scope.source && $scope.source === 'vmware' || $scope && $scope.source && $scope.source.value  && $scope.source.value === 'vmware'){
                add_new = true;
                $scope.group_by_choices = (inventorySourceData.group_by) ? inventorySourceData.group_by.split(',')
                    .map((i) => ({name: i, label: i, value: i})) : [];
                $scope.group_by = $scope.group_by_choices;
                $scope.groupByPopOver = "<p> ToDo: VMWare group by documentation here</p>";
                $scope.instanceFilterPopOver = "<p> ToDo: VMWare instance groups popover content</p>";
            }
            CreateSelect2({
                element: '#inventory_source_group_by',
                multiple: true,
                addNew: add_new
            });
        }

        $scope.lookupProject = function(){
            $state.go('.project', {
                project_search: {
                    page_size: '5',
                    page: '1'
                }
            });
        };

        $scope.lookupCredential = function(){
            let kind = ($scope.source.value === "ec2") ? "aws" : $scope.source.value;
            $state.go('.credential', {
                credential_search: {
                    kind: kind,
                    page_size: '5',
                    page: '1'
                }
            });
        };

        $scope.formCancel = function() {
            $state.go('^');
        };
        $scope.formSave = function() {
            var params;

            params = {
                id: inventorySourceData.id,
                name: $scope.name,
                description: $scope.description,
                inventory: inventoryData.id,
                instance_filters: $scope.instance_filters,
                source_script: $scope.inventory_script,
                credential: $scope.credential,
                overwrite: $scope.overwrite,
                overwrite_vars: $scope.overwrite_vars,
                update_on_launch: $scope.update_on_launch,
                update_cache_timeout: $scope.update_cache_timeout || 0,
                verbosity: $scope.verbosity.value,
                // comma-delimited strings
                group_by: SourcesService.encodeGroupBy($scope.source, $scope.group_by),
                source_regions: _.map($scope.source_regions, 'value').join(',')
            };

            if ($scope.source) {
                params.source_vars = $scope[$scope.source.value + '_variables'] === '---' || $scope[$scope.source.value + '_variables'] === '{}' ? null : $scope[$scope.source.value + '_variables'];
                params.source = $scope.source.value;
                if ($scope.source.value === 'scm') {
                  params.update_on_project_update = $scope.update_on_project_update;
                  params.source_project = $scope.project;

                  if ($scope.inventory_file === '/ (project root)') {
                      params.source_path = "";
                  } else {
                      params.source_path = $scope.inventory_file;
                  }
                }
            } else {
                params.source = null;
            }

            SourcesService
              .put(params)
              .then(() => $state.go('.', null, { reload: true }));
        };

        $scope.sourceChange = function(source) {
            source = (source && source.value) ? source.value : '';
            $scope.credentialBasePath = GetBasePath('credentials') + '?credential_type__kind__in=cloud,network';
            if (source === 'ec2' || source === 'custom' || source === 'vmware' || source === 'openstack' || source === 'scm') {
                $scope.envParseType = 'yaml';

                var varName;
                if (source === 'scm') {
                    varName = 'custom_variables';
                } else {
                    varName = source + '_variables';
                }

                $scope[varName] = $scope[varName] === (null || undefined) ? '---' : $scope[varName];
                ParseTypeChange({
                    scope: $scope,
                    field_id: varName,
                    variable: varName,
                    parse_variable: 'envParseType'
                });
            }

            if (source === 'scm') {
              $scope.overwrite_vars = true;
              $scope.inventory_source_form.inventory_file.$setPristine();
            } else {
              $scope.overwrite_vars = false;
            }

            // reset fields
            $scope.group_by_choices = source === 'ec2' ? $scope.ec2_group_by : null;
            // azure_rm regions choices are keyed as "azure" in an OPTIONS request to the inventory_sources endpoint
            $scope.source_region_choices = source === 'azure_rm' ? $scope.azure_regions : $scope[source + '_regions'];
            $scope.cloudCredentialRequired = source !== '' && source !== 'scm' && source !== 'custom' && source !== 'ec2' ? true : false;
            $scope.source_regions = null;
            $scope.credential = null;
            $scope.credential_name = null;
            $scope.group_by = null;
            $scope.group_by_choices = [];

            initRegionSelect();

        };

        init();
    }
];
