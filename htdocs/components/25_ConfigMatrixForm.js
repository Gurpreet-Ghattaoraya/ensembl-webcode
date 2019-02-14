/*
 * Copyright [1999-2015] Wellcome Trust Sanger Institute and the EMBL-European Bioinformatics Institute
 * Copyright [2016-2018] EMBL-European Bioinformatics Institute
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


Ensembl.Panel.ConfigMatrixForm = Ensembl.Panel.Configurator.extend({
  constructor: function (id, params) {
    this.base(id, params);
    Ensembl.EventManager.remove(id); // Get rid of all the Configurator events which we don't care about
  },
  
  init: function () {
    var panel = this;
    Ensembl.Panel.prototype.init.call(this); // skip the Configurator init - does a load of stuff that isn't needed here
    Ensembl.EventManager.register('modalPanelResize', this, this.resize);
    Ensembl.EventManager.register('updateConfiguration', this, this.updateConfiguration);

    this.elLk.dx        = {};
    this.elLk.dx.container = $('div#dx-content', this.el);

    this.elLk.dy        = {};
    this.elLk.dy.container = $('div#dy-content', this.el);

    this.elLk.buttonTab       = this.el.find("div.track-tab");
    this.elLk.breadcrumb      = this.el.find("div.large-breadcrumbs li");
    this.elLk.trackPanel      = this.el.find(".track-panel#track-content");
    this.elLk.matrixContainer = this.el.find('div.matrix-container');    
    this.elLk.trackConfiguration = this.el.find(".track-panel#configuration-content");
    this.elLk.resultBox       = this.el.find(".result-box");
    this.elLk.filterList      = this.el.find("ul.result-list");
    this.elLk.displayButton   = this.el.find("button.showMatrix");
    this.elLk.clearAll        = this.el.find("span.clearall");
    this.localStoreObj        = new Object();
    this.localStorageKey      = 'RegMatrix';
    this.elLk.lookup          = new Object();
    
    this.buttonOriginalWidth = this.elLk.displayButton.outerWidth();
    this.buttonOriginalHTML  = this.elLk.displayButton.html();
    this.matrixLoadState     = true;

    this.rendererConfig = {
      'normal': 'normal',
      'peak': 'compact',
      'signal': 'signal',
      'peak-signal': 'signal_feature'
    }

    this.resize();

    panel.el.find("div#dy-tab div.search-box").hide();

    $.ajax({
      url: '/Json/RegulationData/data?species='+Ensembl.species,
      dataType: 'json',
      context: this,
      success: function(json) {
        this.json = json;
        this.trackTab();
        this.populateLookUp();
        this.loadState();
        this.setDragSelectEvent();
        this.registerRibbonArrowEvents();
        this.updateRHS();
        this.addExtraDimensions();
        this.resize();
        this.goToUserLocation();
      },
      error: function() {
        this.showError();
      }
    });

    this.elLk.buttonTab.on("click", function (e) {     
      var activeTab = panel.getActiveTab();
      if (e.target.nodeName !== 'INPUT' && e.currentTarget.id !== activeTab+'-tab') {
        panel.elLk.trackPanel.find('input[name="matrix_search"]').val('');
        panel.resetFilter(); // Reset filter on the active tab
      }
      panel.toggleTab({'selectElement': this, 'container': panel.el.find("div.track-menu")});
      panel.resize();
    });

    this.elLk.breadcrumb.on("click", function (e) {
      panel.toggleBreadcrumb(this);
      e.preventDefault();
    });

    this.clickSearchIcon();
    this.clickSubResultLink();
    this.showHideFilters();
    this.clickCheckbox(this.elLk.filterList, 1);
    this.clearAll(this.elLk.clearAll);
    this.resetTracks();
    this.resetMatrix();

    panel.el.on("click", function(e){
      //if not switch for setting on/off column/row/cell in cell popup
      if(!$(e.target).parent().closest('div').hasClass('track-popup') && panel.trackPopup) {
        panel.el.find('div.matrix-container div.xBoxes.track-on, div.matrix-container div.xBoxes.track-off').removeClass("mClick");
        panel.trackPopup.hide();
      }      
    });

    this.el.find('.view-track, button.showMatrix').on('click', function() {
      if($(this).hasClass('_edit') || $(this).hasClass('view-track active')) { 
        panel.addExtraDimensions();
        Ensembl.EventManager.trigger('modalClose');
      }
    });

    //this has to be after on click event to capture the button class before it gets changed
    this.clickDisplayButton(this.elLk.displayButton, this.el.find("li._configure"));

    // Filtering functionality
    this.elLk.trackPanel.find('input[name="matrix_search"]').on('input', function(e) {
      var inputText = $(this).val().trim();

      if (!panel.resetFilter(inputText)) {
        return;
      };

      var activeTabId = panel.getActiveTab();
      var re = new RegExp(inputText, "gi");
      var match = Object.keys(panel.elLk.lookup).filter(function(name) {
        return name.match(re) && panel.elLk.lookup[name].parentTabId === activeTabId;
      });

      if (match.length) {
        var classString = '.' + match.join(',.');
        var li_arr = panel.elLk.lookup[match[0]].parentTab.find('li').not(classString);
        $.each(li_arr, function(i, li) {
          if ($(li).css('display') !== 'none') {
            $(li).addClass('_search_hide').hide();
          }
        });
      }
      else {
        panel.elLk[activeTabId].container.find('li').addClass('_search_hide').hide();
      }
      panel.updateAvailableTabsOrRibbons(activeTabId, true);
    });
  },

  resetFilter: function (inputText, reset) {
    var panel = this;

    panel.getActiveTabContainer().find('li._search_hide').removeClass('_search_hide');
    var _filtered = panel.getActiveTabContainer().find('li._filtered');
    if (_filtered.length) {
      _filtered.show();
    }
    else {
      panel.getActiveTabContainer().find('li').show();
    }

    var activeTabId = panel.getActiveTab();

    panel.updateAvailableTabsOrRibbons(activeTabId, true, reset);

    if (inputText && inputText.length < 3) {
      return 0;
    }
    else {
      return 1;
    }
  },  

  // Udpate available tabs or ribbons after filtering
  updateAvailableTabsOrRibbons(tabId, resetRibbon, resetFilter) {
    var panel = this;
    var tabLookup = panel.elLk[tabId];
    var dimension_name = panel[tabId];
    if (!tabLookup.haveSubTabs) {
      panel.activateAlphabetRibbon(tabLookup.container, resetRibbon, resetFilter);
    }
    else {
      // For subtabs
      var currentActiveTabId;
      var availableTabsWithData = [];
      $.each(Object.keys(panel.elLk[tabId].tabs), function(i, key) {
        if (tabLookup.tabs[key]) {
          var tab_ele = tabLookup.tabs[key];
          if ($(tab_ele).hasClass('active')) {
            currentActiveTabId = key;
          }

          // $(tab_ele).removeClass('active')
          var tab_content_ele = $('#' + key + '-content', panel.el.trackPanel);
          var lis = tabLookup.tabContents[key];
          var flag = 0;

          $(tabLookup.tabs[key]).addClass('inactive');

          $('li', tab_content_ele).each(function(i, li) {
            if ($(li).css('display') !== 'none') {
              flag = 1;
              return false;
            }
          });

          if (flag == 1) {
            flag = 0;
            $(tabLookup.tabs[key]).removeClass('inactive');
            availableTabsWithData.push(key);
          }

          // Activate available letters if list type is alphabetRibbon
          if (panel.json.data[panel[tabId]].data[key].listType === 'alphabetRibbon') {
            panel.activateAlphabetRibbon(tab_content_ele, resetRibbon, resetFilter);
          }

          var visible = $('li:visible', tab_content_ele);
          panel.updateTrackPanelSelectAllCount(key, visible.length);

        }
      });

      // If any of the final available tabs have class "active" then leave. If not move it to the first available
      if (availableTabsWithData.length && currentActiveTabId) {
        if(!currentActiveTabId || availableTabsWithData.indexOf(currentActiveTabId) < 0) {
          // Move to first active tab
          panel.toggleTab({'selectElement': $(tabLookup.tabs[availableTabsWithData[0]]), 'container': $(tabLookup.tabs[availableTabsWithData[0]]).parent()});
        }
      }
    }
  },

  activateAlphabetRibbon: function(alphabetContainer, resetRibbon, resetFilter) {
    var panel = this;
    var activeRibbon, activeRibbonClass;
    var flag = 0;

    var alphabetRibbonDivs = alphabetContainer.find('.ribbon-banner .alphabet-div');
    var alphabetRibbonContentDivs = alphabetContainer.find('.ribbon-content .alphabet-content');
    var selectedActiveRibbon = alphabetContainer.find('.ribbon-content .alphabet-content.active');

    $(alphabetRibbonDivs).removeClass('active').addClass('inactive');

    var li = alphabetContainer.find('li');
    var li_filtered = alphabetContainer.find('li._filtered');
    var li_search_hide = alphabetContainer.find('li._search_hide');

    var availableRibbonContainers = $(li).closest('.alphabet-content');
    var arr = {};

    $.each(availableRibbonContainers, function(i, ribbonContent) {
      $('li', ribbonContent).each(function(i, li) {
        if ($(li).css('display') !== 'none') {
          flag = 1;
          return false;
        }
      });
      if (flag == 1) {
        flag = 0;
        activeRibbonData = $(ribbonContent).data('ribbon');
        activeRibbonClass = '.' + activeRibbonData;
        activeRibbon = alphabetRibbonDivs.not(':not("'+activeRibbonClass+'")');
        activeRibbon.removeClass('inactive');
        arr[activeRibbonData] = activeRibbon;
      }
    });

    var currentlySelected = selectedActiveRibbon.data('ribbon');
    var obj = {'container': alphabetContainer, 'selByClass': 1, 'resetRibbonOffset': resetRibbon, 'searchTriggered': true}
    obj.resetFilter = resetFilter && true;

    if (arr[currentlySelected]) {
      obj.selectElement = arr[currentlySelected];
      panel.toggleTab(obj);
    }
    else {
      // console.log('activating first available', alphabetContainer.attr('id'));
      obj.selectElement = arr[Object.keys(arr).sort()[0]];
      panel.toggleTab(obj);
    }

    // Activate arrows
    var activeAlphabets = panel.getActiveAlphabets(alphabetContainer);
    var larrow = alphabetContainer.find('.ribbon-banner .larrow');
    var rarrow = alphabetContainer.find('.ribbon-banner .rarrow');

    $(larrow, rarrow).removeClass('inactive active');
    if (activeAlphabets.length <= 0) {
      $(larrow).addClass('inactive');
      $(rarrow).addClass('inactive');
      return;
    }

    if ($(activeAlphabets[0]).hasClass('active')) {
      $(larrow).addClass('inactive');
      (activeAlphabets.length > 1) && $(rarrow).addClass('active');
    }
    else {
      $(larrow).removeClass('inactive').addClass('active');
    }

    if ($(activeAlphabets[activeAlphabets.length-1]).hasClass('active')) {
      $(rarrow).addClass('inactive');
      (activeAlphabets.length > 1) && $(larrow).addClass('active');
    }
    else {
      $(rarrow).removeClass('inactive').addClass('active');
    }
  },

  addExtraDimensions: function() {
    var panel = this;
    // Add extra columns data to lookup (for reg feats)
    if (panel.json.extra_dimensions) {
      panel.json.extra_dimensions.forEach(function(dim) {
        panel.elLk.lookup[dim] = panel.json.data[dim];
      });
    }
  },

  // Called by triggerSpecific from the parent Configurator panel.
  // Does not cause an AJAX request, just returns the diff data.
  updateConfiguration: function () {

    var panel  = this;
    var config = {};
    var key, prefix;
    var arr = [];

    //resetting filter box and content
    panel.elLk.searchIcon.parent().find('input.configuration_search_text').val("");
    panel.resetFilter("", true);

    //store on which tab the user is on
    panel.localStoreObj.userLocation && panel.setUserLocation();

    // If no matrix available in localstore, that means user hasn't clicked on "Configure Display" button
    // In that case, call displayMatrix() to create the necessary localStore objects
    if (Object.keys(panel.localStoreObj).length <= 0) {
      return;
    }

    if(Object.keys(panel.localStoreObj[panel.json.extra_dimensions[0]]).length <= 0) {
      panel.displayMatrix();
    }

    $.each(panel.json.extra_dimensions, function (i, dim) {
      if (!panel.localStoreObj[dim]) {
        return;
      }
      $.each(panel.localStoreObj[dim], function (k, v) {
        if (k.match(/_sep_/)) {
          if (v.state) {
            key = '';
            arr = k.split('_sep_');
            key = panel.elLk.lookup[arr[0]].set + '_' + panel.elLk.lookup[arr[1]].label;
            config[key] = { renderer : v.state === 'track-on' ? panel.rendererConfig[v.renderer] : 'off' };

            if (panel.localStoreObj.dy && panel.localStoreObj.dy[arr[0]]) {
              key = panel.elLk.lookup[arr[0]].set + '_' + panel.elLk.lookup[arr[1]].label + '_' + panel.elLk.lookup[arr[0]].label;
              config[key] = { renderer : v.state === 'track-on' ? 'on' : 'off'};
            }
          }
        }
      });
    })

    if (!panel.localStoreObj.matrix) {
      return;
    }

    $.each(panel.localStoreObj.matrix, function (k, v) {
      if (k.match(/_sep_/)) {
        if (v.state) {
          key = '';
          arr = k.split('_sep_');
          key = panel.elLk.lookup[arr[0]].set + '_' + panel.elLk.lookup[arr[1]].label;
          config[key] = { renderer : v.state === 'track-on' ? panel.rendererConfig[v.renderer] : 'off' };

          if (panel.localStoreObj.dy && panel.localStoreObj.dy[arr[0]]) {
            key = panel.elLk.lookup[arr[0]].set + '_' + panel.elLk.lookup[arr[1]].label + '_' + panel.elLk.lookup[arr[0]].label;
            config[key] = { renderer : v.state === 'track-on' ? 'on' : 'off'};
          }
        }
      }
    });

    $.extend(true, this.imageConfig, config);
    return { imageConfig: config, noRendererUpdate: true };
  },

  getNewPanelHeight: function() {
    return $(this.el).closest('.modal_content.js_panel').outerHeight() - 160;
  },

  resize: function() {
    var panel = this;
    panel.elLk.resultBox.outerHeight(this.getNewPanelHeight());
    if (panel.elLk[this.getActiveTab()].haveSubTabs) {
      $.each(panel.elLk[this.getActiveTab()].tabContentContainer, function(tabName, tabContent) {
        var ul = $('ul', tabContent);
        ul.outerHeight(panel.getNewPanelHeight() - 145);
      });
      panel.elLk.trackPanel.find('.ribbon-content ul').outerHeight(panel.getNewPanelHeight() - 190);
    }
    else {
      panel.elLk.trackPanel.find('.ribbon-content ul').outerHeight(this.getNewPanelHeight() - 140);
    }
    panel.elLk.matrixContainer.outerHeight(this.getNewPanelHeight() - 60);
  },

  getActiveTabContainer: function() {
    return $('div#dx-content.active, div#dy-content.active', this.el);
  },
  getActiveTab: function() {
    return $('div#dx-content.active span.rhsection-id, div#dy-content.active span.rhsection-id', this.el).html();
  },
  getActiveSubTab: function() {
    return $('div#dx-content.active .tab-content.active span.rhsection-id, div#dy-content.active .tab-content.active span.rhsection-id', this.el).html();
  },

  populateLookUp: function() {
    var panel = this;
    // cell elements
    this.elLk.dx.ribbonBanner = $('.ribbon-banner .letters-ribbon .alphabet-div', this.elLk.dx.container);
    this.elLk.dx.tabContents = $('.ribbon-content li', this.elLk.dx.container);
    this.elLk.dx.haveSubTabs = false;

    // ExpType elements
    this.elLk.dy.haveSubTabs = true;
    this.elLk.dy.tabs = {}
    this.elLk.dy.tabContents = {};
    panel.elLk.dy.tabContentContainer = {};
    var dyTabs = $('.tabs.dy div.track-tab', this.elLk.dy.container);
    $.each(dyTabs, function(i, el) {
      var k = $(el).attr('id').split('-')[0] || $(el).attr('id');
      panel.elLk.dy.tabs[k] = el;
      var contentId = '#'+k+'-content';
      panel.elLk.dy.tabContentContainer[k] = panel.elLk.dy.container.find(contentId);
      var tabContentId = $('span.content-id', el).html();
      panel.elLk.dy.tabContents[k] = $('div#' + tabContentId + ' li', panel.elLk.dy.container);
    });
  },

  loadState: function() {
    var panel = this;
    this.loadingState = true;
    this.localStoreObj = this.getLocalStorage();
    if (!Object.keys(this.localStoreObj).length) {
      this.loadingState = false;
      return;
    }

    // Apply cell first so that filter happens and then select all experiment types
    if (this.localStoreObj.dx) {
      var el;
      $.each(this.localStoreObj.dx, function(k) {
        el = panel.elLk.dx.tabContents.not(':not(.'+ k +')');
        panel.selectBox(el);
      });
      panel.filterData($(el).data('item'));
    }
    if (this.localStoreObj.dy) {
      var el, subTab;
      $.each(this.localStoreObj.dy, function(k) {
        subTab = panel.elLk.lookup[k].subTab;
        el = panel.elLk.dy.tabContents[subTab].filter(function() {return $(this).hasClass(k)});
        panel.selectBox(el);
      });

      // If there were no celltypes selected then filter based on exp type
      !this.localStoreObj.dx && this.localStoreObj.dy && panel.filterData($(el).data('item'));
    }

    panel.updateRHS();

    this.loadingState = false;
  },

  setUserLocation: function() {
    var panel = this;

    if (!panel.localStoreObj.userLocation) {
      return;
    }
    //get current active panel (either select tracks or matrix)
    panel.localStoreObj.userLocation.view = panel.elLk.breadcrumb.filter(".active").attr("id");
    if(panel.elLk.trackPanel.hasClass("active")) {
      panel.localStoreObj.userLocation.tab = panel.elLk.trackPanel.find("div.track-menu div.track-tab.active").attr("id");
    } else {
      panel.localStoreObj.userLocation.tab = "";
    }
    panel.setLocalStorage();
  },

  goToUserLocation: function() {
    var panel = this;

    if($.isEmptyObject(panel.localStoreObj.userLocation)) { return; }

    panel.toggleBreadcrumb('#'+panel.localStoreObj.userLocation.view);
    if(panel.localStoreObj.userLocation.tab){
      panel.toggleTab({'selectElement': '#'+panel.localStoreObj.userLocation.tab, 'container': panel.el.find("div.track-menu")});
    }    
  },

  setDragSelectEvent: function() {
    var panel = this;

    if (this.dragSelect) return;

    this.dragSelect = new Selectables({
      elements: 'li span',
      // selectedClass: 'selected',
      zone: '._drag_select_zone',
      onSelect: function(el) {
        panel.selectBox(el.parentElement, 1);
        this.el = el.parentElement;
      },
      stop: function() {
        var item = $(this.el).data('item');
        // Making sure if item is from the active tab
        if (item && panel.elLk.lookup[item].parentTabId === panel.getActiveTab()) {
          panel.filterData(item);
          panel.updateRHS();
        }
      }
    });
  },

  //function when click clear all link which should reset all the filters
  clearAll: function (clearLink) {
    var panel = this;
    
    clearLink.on("click",function(e){
      $.each(panel.el.find('div.result-box').find('li').not(".noremove"), function(i, ele){
        panel.selectBox(ele);
      });
    });
    
  },

  // Function to show filter box when clicking on the search-icon
  clickSearchIcon: function() {
    var panel = this;
    
    panel.elLk.searchIcon = panel.el.find("img.search-icon");

    panel.elLk.searchIcon.click("on", function(e){
      panel.elLk.searchIcon.parents('div.search-box:visible').find('input.configuration_search_text, span.search-cross-icon').animate({width:'toggle'},350).focus();
      panel.elLk.searchIcon.parents('div.search-box:visible').find('img.search-icon').hide();
      e.stopPropagation();
    });

    panel.closeSearch();
  },

  closeSearch: function() {
    var panel = this;

    panel.elLk.searchCrossIcon = panel.elLk.searchIcon.parents('div.search-box').find('span.search-cross-icon');

    panel.elLk.searchCrossIcon.click("on", function(){
      panel.elLk.searchIcon.parents('div.search-box:visible').find('input.configuration_search_text, span.search-cross-icon').toggle("slide", function() {
        panel.elLk.searchIcon.parents('div.search-box:visible').find('input.configuration_search_text').val("");
        panel.resetFilter("");
        panel.elLk.searchIcon.parents('div.search-box:visible').find('img.search-icon').show();
      });      
    });    
  },
  
  // Function to check divs that needs to have content to enable or disable apply filter button
  // Argument: ID of div to check for content
  enableConfigureButton: function (content) {
    var panel = this;
    
    var total_div = $(content).length;
    var counter   = 0;

    $(content).each(function(i, el){
      if($(el).find('li').length && $(el).find('span.fancy-checkbox.selected').length) { 
        counter++;
      }
    });

    if(counter === total_div) {
      panel.el.find('button.filter').addClass('active');
      panel.el.find('li._configure').removeClass('inactive');
      panel.elLk.displayButton.addClass('active')
    } else {
      panel.el.find('button.filter').removeClass('active');
      panel.el.find('li._configure').addClass('inactive');
      panel.elLk.displayButton.removeClass('active');
    }
  },
  
  //function to show/hide error message for empty track filters
  // Argument: containers where to listen for empty elements (Note: span error id should match container id with an underscore)
  trackError: function(containers) {
    var panel = this;

    $(containers).each(function(i, ele) {
        var error_class = "_" + $(ele).attr('id');
        if ($(ele).find('li').length && $(ele).find('span.fancy-checkbox.selected').length) {
            $("span." + error_class).hide();
        } else {
            $("span." + error_class).show();
        }
    });

  },

  // Function to update the current count in the right hand panel (can be adding/removing 1 or select all)
  // Argument: element/container object where current count is to be updated
  //           how much to add to the current value
  updateCurrentCount: function(key, selected, total) {
    var panel = this;
    if(key) {
      $('#'+key+' span.current-count', this.elLk.resultBox).html(selected);
      $('#'+key+' span.total', this.elLk.resultBox).html(total);
      this.updateTrackPanelSelectAllCount(key, total);
    }
  },

  updateTrackPanelSelectAllCount: function(key, total) {
    var panel = this;
    if(key) {
      $('#allBox-' + key + '-content ._num').html('(' + total + ')');
    }
  },

  // Function to select/unselect checkbox and removing them from the right hand panel (optional) and adding them to the right hand panel (optional)
  //Argument: container is an object where the checkbox element is
  //        : removeElement either 1 or 0 whether to remove element 
  //        : AddElement is either 1 or 0
  //        : allBox is Object of select all box, check if it needs to be on or off
  clickCheckbox: function (container, removeElement, addElement, allBox) {
    var panel = this;
    var itemListen = "li";
    if(container[0].nodeName === 'DIV') {
      itemListen = "";
    }
    //clicking checkbox
    $(container).off().on("click", itemListen, function(e) {
      panel.selectBox(this);

      // If all LIs are removed then disable configuration tab and toggle to select tracks tab
      if ($(this).closest('ul.result-list').children('li').length > 1){
        // checking > 1 because the last li is still not removed at this point
        panel.removeFromMatrix($(this).data('item'));
      }
      else {
        panel.toggleButton();
        $(this).closest('.result-content').find('.sub-result-link').click();
      }

      var ele = $(this).data('item');
      if($(this).hasClass('all-box')) {
        // if(!$(this).hasClass('no-filter')) {
          ele = $(this).closest('.tab-content').find('li')[0];
          ele = $(ele).data('item');
        // }
      }

      panel.filterData(ele);
      panel.updateRHS();

      //check whether the select all box is on/off, if it is off and all filters are selected, then make it on and if it is on and all filters are not selected then make it off
      if(allBox && itemListen === "li"){
        if(container.find("span.fancy-checkbox.selected").length === container.find("span.fancy-checkbox").length) {
          allBox.find("span.fancy-checkbox").addClass("selected");
        } else {
          allBox.find("span.fancy-checkbox").removeClass("selected");
        }
      }
      e.stopPropagation();
    });  
  },
  
  removeFromMatrix: function(item) {
    var panel = this;
    if (!item) return;
    panel.elLk.trackConfiguration.find('.matrix-container .' + item + ', .matrix-container ._emptyBox_' + item).remove();
    var allStoreObjects = $.extend({}, panel.localStoreObj.matrix);

    $.each(panel.json.extra_dimensions,function(i, dim){
      $.extend(allStoreObjects, panel.localStoreObj[dim]);
    });

    // Update localStoreObj and local storage
    Object.keys(allStoreObjects).map(function(key) {
      if (key.match(item+'_') || key.match('_' + item)) {
        var storeObjKey = panel.itemDimension(key);
        //update other rows/columns in store when removing item
        var cellCurrState    = panel.localStoreObj[storeObjKey][key]["state"].replace("track-","");
        var cellCurrRenderer = panel.localStoreObj[storeObjKey][key]["renderer"];

        $.each(key.split("_sep_"),function(i, associatedEle){
          if(associatedEle != item) {
            panel.localStoreObj[storeObjKey][associatedEle]["total"] -= 1;
            if(panel.localStoreObj[storeObjKey][associatedEle]["state"][cellCurrState] > 0) { 
              panel.localStoreObj[storeObjKey][associatedEle]["state"][cellCurrState] -= 1; 
              panel.localStoreObj[storeObjKey][associatedEle]["state"]["reset-"+cellCurrState] -= 1; 
            }
            if(panel.localStoreObj[storeObjKey][associatedEle]["renderer"][cellCurrRenderer] > 0) { 
              panel.localStoreObj[storeObjKey][associatedEle]["renderer"][cellCurrRenderer] -= 1; 
              panel.localStoreObj[storeObjKey][associatedEle]["renderer"]["reset-"+cellCurrRenderer] -= 1; 
            }
          }
        });
        delete panel.localStoreObj[storeObjKey][key];
      }
    });
    delete panel.localStoreObj[panel.itemDimension(item)][item];

    panel.setLocalStorage();
  },

  updateRHS: function(item) {
    var panel = this;
    panel.updateSelectedTracksPanel(item);
    panel.activateTabs();
    panel.updateShowHideLinks(item);
    panel.setLocalStorage();
    panel.trackError('div#dx, div#source');
    panel.enableConfigureButton('div#dx, div#source');
  },


  //Function to select filters and adding/removing them in the relevant panel
  selectBox: function(ele) {
    var panel = this;
    var chkbox = $('span.fancy-checkbox', ele);
    var selected = chkbox.hasClass('selected');

    if($(ele).hasClass('all-box')) {
      var _class = '';
      if ($(ele).closest('.tab-content').find('li._filtered').length) {
        _class = '._filtered';
      }

      var available_LIs = $(ele).closest('.tab-content').find('li' + _class + ':not("._search_hide") span.fancy-checkbox');

      if (!selected) {
        chkbox.addClass('selected');
        // var $(ele).closest('.tab-content').find('li span.fancy-checkbox');
        available_LIs.addClass("selected");
      }
      else {
        chkbox.removeClass('selected')
        available_LIs.removeClass('selected');
      }

      // add 'selected: true/flase' to lookup
      available_LIs.parent().map(function() {
        panel.elLk.lookup[$(this).data('item')].selected = !selected;
      })

    }
    else {

      var item = $(ele).data('item');
      panel.elLk.lookup[item].selected = !selected;

       // Select/deselect elements from LH and RH panels. For that, get the elements from panel.el
      var itemElements = $('.' + item, panel.el);
      if (selected) {
        $(itemElements).find("span.fancy-checkbox").removeClass("selected");
      }
      else {
        $(itemElements).find("span.fancy-checkbox").addClass("selected");
      }


      // Update all-box selected class based on selection
      var lis_unselected = $(itemElements).closest('.tab-content').find('li span.fancy-checkbox').not(".selected");
      var allBox = $(itemElements).closest('.tab-content').find('.all-box span.fancy-checkbox')
      lis_unselected.length ? allBox.removeClass('selected') : allBox.addClass('selected');

    }
  },


  updateSelectedTracksPanel: function(item) {
    var panel = this;
    var selectedElements = [];
    this.selectedTracksCount = {};
    this.totalSelected = 0;
    ['dx', 'dy'].forEach(function(key) {
      var selectedLIs, allLIs;
      if (panel.elLk[key].haveSubTabs) {
        // If tab have subtabs
        $.each(panel.elLk[key].tabContents, function(subTab, lis) {
          selectedLIs = lis.has('.selected') || [];
          allLIs = lis.has('._filtered') || [];
          // In case _filtered class is not applied
          // Add lis with _search_hide class. because all _search_hide lis will have display = 'none'
          allLIs = allLIs.length || lis.filter(function() { return $(this).css('display') !== 'none' || $(this).hasClass('_search_hide') });

          // Storing counts of each tabs - selected and available,  to activate/deactivate tabs and ribbons
          panel.selectedTracksCount[subTab] = panel.selectedTracksCount[subTab] || {};
          panel.selectedTracksCount[subTab].selected = panel.selectedTracksCount[subTab].selected || [];

          $(selectedLIs).map(function(){
            panel.selectedTracksCount[subTab].selected.push($(this).data('item'));
          })
          panel.selectedTracksCount[subTab].available = allLIs.length;
          panel.totalSelected  += selectedLIs.length;

          panel.updateCurrentCount(subTab, selectedLIs.length, allLIs.length);
          selectedLIs.length && selectedElements.push(selectedLIs);
        })
      }
      else {
        selectedLIs = panel.elLk[key].tabContents.has('.selected') || [];
        allLIs = panel.elLk[key].tabContents.has('._filtered') || [];

        // Add lis with _search_hide class. because all _search_hide lis will have display = 'none'
        allLIs = allLIs.length || panel.elLk[key].tabContents.filter(function() { return $(this).css('display') !== 'none' || $(this).hasClass('_search_hide') });

        panel.selectedTracksCount[key] = panel.selectedTracksCount[key] || {};
        panel.selectedTracksCount[key].selected = panel.selectedTracksCount[key].selected || [];
        $(selectedLIs).map(function(){
          panel.selectedTracksCount[key].selected.push($(this).data('item'));
        })
        panel.selectedTracksCount[key].available = allLIs.length;
        panel.totalSelected += selectedLIs.length;

        // update counts
        panel.updateCurrentCount(key, selectedLIs.length, allLIs.length);
        selectedLIs.length && selectedElements.push(selectedLIs);
      }
    });
    // update selected items (cloned checkboxes)
    var clones = {};
    $(selectedElements).each(function(i, arr){
      $(arr).each(function(k, el){
        var k = $(el).data('item');
        clones[k] = $(el).clone().removeClass('noremove _search_hide').show();
      });
    });
    panel.updateSelectedTracks(clones);

    // Update store
    var itemKeys = Object.keys(clones);
    !panel.loadingState && panel.addToStore(itemKeys); // Dont add to store while loading state from store
    panel.setLocalStorage();
  },

  // Update selected tracks on the RH panel
  updateSelectedTracks: function (clones) {
    var panel = this;
    // Remove all clones LIs before inserting new ones
    $('li:not(".noremove")', panel.elLk.filterList).remove();

    $.each(clones, function(k, clone) {
      var rhs_id = panel.elLk.lookup[k].subTab;
      $('#'+rhs_id+'.result-content ul', panel.el).append(clone);
    });
  },

  // Enable or disable tabs/ribbons and also show/hide RH panel title
  activateTabs: function() {
    var panel = this;

    $.each(panel.selectedTracksCount, function(key, count) {
      var tab_ele = $('.tabs #' + key + '-tab', panel.el.trackPanel);
      var tab_content_ele = $('#' + key + '-content', panel.el.trackPanel);
      var rhs_ele = $('#'+key, panel.elLk.resultBox);
      if (count.available) {
        tab_ele.removeClass('inactive');
        rhs_ele.show();
      }
      else {
        tab_ele.removeClass('active').addClass('inactive');
        tab_content_ele.removeClass('active');
        rhs_ele.hide();
      }
    });
  },

  setLocalStorage: function() {
    localStorage.setItem(this.localStorageKey, JSON.stringify(this.localStoreObj));
  },
  getLocalStorage: function() {
    return JSON.parse(localStorage.getItem(this.localStorageKey)) || {};
  },

  addToStore: function(items) {
    //Potential fix
    //if(!this.localStoreObj) { this.localStoreObj.matrix = {}; }
    this.localStoreObj = {};
    if (!items.length) return;
    var panel = this;
    var parentTab;

    $.each(items, function(i, item) {
      parentTab = panel.elLk.lookup[item].parentTabId;
      panel.localStoreObj[parentTab] = panel.localStoreObj[parentTab] || {}
      panel.localStoreObj[parentTab][item] = 1;
    });

    //main object for matrix state
    panel.localStoreObj.matrix = panel.getLocalStorage().matrix  || {};

    //state management for the extra dimension
    $.each(panel.json.extra_dimensions, function(i, data){
      panel.localStoreObj[data] = panel.getLocalStorage()[data]  || {};
    });

    //state management object for user location
    panel.localStoreObj.userLocation = panel.getLocalStorage().userLocation || {};
  },

  removeFromStore: function(item, lhs_section_id) {
    // Removal could happen from RHS or LHS. So section id need to passed as param
    if(lhs_section_id !== 'dx') {
      var tab = 'dy'
      item && lhs_section_id && delete this.localStoreObj[tab][lhs_section_id][item];
    }
    else {
      item && lhs_section_id && delete this.localStoreObj[lhs_section_id][item];
    }
    //TODO need to remove from matrix as well
  },
  
  // Function to show track configuration panel (matrix) when button is clicked
  // Arguments javascript object of the button element and the panel to show
  clickDisplayButton: function(clickButton, tabClick) {
    var panel = this;

    clickButton.on("click", function(e) {
      if(clickButton.hasClass("_edit") ) {
        panel.toggleTab({'selectElement': panel.el.find("li._configure"), 'container': panel.el.find("div.large-breadcrumbs")});
        panel.toggleButton();
      } else if(clickButton.hasClass("active") ) {      
        panel.toggleTab({'selectElement': tabClick, 'container': panel.el.find("div.large-breadcrumbs")});
        panel.toggleButton();        
      }
      panel.emptyMatrix();
      panel.displayMatrix();
    });
  },
  
  //function to jump to tab based on the link
  clickSubResultLink: function() {
    var panel = this;
    panel.el.find('div.sub-result-link').on("click", function(e) {
      var tabId       = "div#" + panel.el.find(this).parent().attr("id") + "-tab";
      var contentId   = "div#" + panel.el.find(tabId).find("span.content-id").html();
      var parentTabId = panel.el.find(this).parent().find("span._parent-tab-id").html();

      panel.el.find(".track-tab.active").first().removeClass("active");
      panel.el.find(".tab-content.active").first().removeClass("active");
      
      panel.elLk.resetTrackButton.show(); //showing reset tracks button on select tracks tab
      //in case the track-content is not active, hide configuration panel first
      if(panel.el.find("div#configuration-content:visible").length){ 
        panel.toggleTab({'selectElement': panel.el.find("li._track-select"), 'container': panel.el.find("div.large-breadcrumbs")});
        panel.toggleButton();
      }

      //for now assuming there is only one parent tab, if there is more than one then we need to create for loop
      if(parentTabId){
        var parentTab       = "div#" + parentTabId;
        var parentContentId = "div#" + panel.el.find(parentTab).find("span.content-id").html();

        panel.el.find(parentContentId+" .track-tab.active").removeClass("active");
        panel.el.find(parentContentId+" .tab-content.active").removeClass("active");
        panel.el.find(parentTab).addClass("active");
        panel.el.find(parentContentId).addClass("active");

        //showing/hiding searchbox in the main tab
        if($(parentTab).find("div.search-box").length) {
          panel.el.find(".search-box").hide();
          $(parentTab).find("div.search-box").show();
        }
      }

      //showing/hiding searchbox in the main tab
      if($(tabId).find("div.search-box").length) {
        panel.el.find(".search-box").hide();
        $(tabId).find("div.search-box").show();
      }

      panel.el.find(tabId).addClass("active");
      panel.el.find(contentId).addClass("active");
    });
  },

  updateShowHideLinks: function() {
      var panel = this;

      $.each(panel.elLk.filterList, function(i, ul) {
        if (!$(ul).siblings("div.show-hide:visible").length && $('li', ul).length) {
          var _class =  $(ul).css('display') === 'none' ? '._show' : '._hide';
          $(ul).siblings(_class).show();
        }
        else if ($(ul).siblings("div.show-hide:visible").length && $('li', ul).length === 0) {
          $(ul).siblings('._hide, ._show').hide();
        }
      })
  },

  //function to toggle filters in right hand panel when show/hide selected is clicked
  showHideFilters: function() {
      var panel = this;

      panel.el.find('div.show-hide').on("click", function(e) {
          panel.el.find(this).parent().find('div.show-hide, ul.result-list').toggle();
      });
  },

  trackTab: function() {
    var panel = this;
    //showing and applying cell types
    var dxContainer = panel.el.find("div#dx-content");
    var rhSectionId = dxContainer.data('rhsection-id');
    panel.dx = panel.json.dimensions[0];
    panel.dy = panel.json.dimensions[1];
    var dx = panel.json.data[panel.dx];
    var dy = panel.json.data[panel.dy];

    this.displayCheckbox(
      {
        data: Object.keys(dx.data),
        container: "div#dx-content",
        listType: dx.listType,
        parentTabContainer: dxContainer,
        rhSectionId: rhSectionId,
        noFilter: true
      }
    );

    //showing experiment type tabs
    var dy_html = '<div class="tabs dy">';
    var content_html    = "";

    //sort dy object
    Object.keys(dy.data).sort().forEach(function(key) {
        var value = dy.data[key];
        delete dy.data[key];
        dy.data[key] = value;
    });

    var count = 0;
    $.each(dy.data, function(key, item){
      var active_class = "";
      if(count === 0) { active_class = "active"; } //TODO: check the first letter that there is data and then add active class
      dy_html += '<div class="track-tab '+active_class+'" id="'+key+'-tab">'+item.name+'<span class="hidden content-id">'+key+'-content</span></div>';
      content_html += '<div id="'+key+'-content" class="tab-content '+active_class+'" data-rhsection-id="'+ key +'""><span class="hidden rhsection-id">'+key+'</span></div>';
      count++;
    });
    dy_html += '</div>';
    var dyContainer = panel.el.find("div#dy-content");
    dyContainer.append(dy_html).append(content_html);
    rhSectionId = dyContainer.data('rhsection-id');
    
    //displaying the experiment types
    if (dy.subtabs) {
      $.each(dy.data, function(key, subTab){
        panel.displayCheckbox(
          {
            data: subTab.data,
            container: "div#"+key+"-content",
            listType: subTab.listType,
            parentTabContainer: dyContainer,
            rhSectionId: rhSectionId,
            noFilter: true,
            set: subTab.set
          }
        );
      });
    }
    else {
      this.displayCheckbox(
        {
          data: dy.data,
          container: "div#dy-content", 
          listType: dy.listType,
          parentTabContainer: dyContainer,
          rhSectionId: rhSectionId,
          noFilter: true
        }
      );
    }

    //adding dimension Y and X relationship as data-attribute
    panel.addRelationData();

    //selecting the tab in experiment type
    this.el.find("div.dy div.track-tab").on("click", function () {
      panel.toggleTab({'selectElement': this, 'container': panel.el.find("div.dy")});
      panel.resize();
    });    
    
  },
  
  // Function to toggle tabs and show the corresponding content which can be accessed by #id or .class
  // Arguments: selectElement is the tab that's clicked to be active or the tab that you want to be active (javascript object)
  //            container is the current active tab (javascript object)
  //            selByClass is either 1 or 0 - decide how the selection is made for the container to be active (container accessed by #id or .class)
  toggleTab: function(obj) {
  
    var selectElement = obj.selectElement;
    var container = obj.container;
    var selByClass = obj.selByClass;
    var resetRibbonOffset = obj.resetRibbonOffset;
    var searchTriggered = obj.searchTriggered;
    var noOffsetUpdate = obj.resetFilter;
    var panel = this;

    if((!$(selectElement).hasClass("active") && !$(selectElement).hasClass("inactive"))) {
      //showing/hiding searchbox in the main tab
      if($(selectElement).find("div.search-box").length) {
        panel.el.find(".search-box").hide();
        $(selectElement).find("div.search-box").show();
      }

      //remove current active tab and content
      var activeContent = container.find(".active span.content-id").html();
      container.find(".active").removeClass("active");
      if(selByClass) {
        container.find("div."+activeContent).removeClass("active");
      } else {
        panel.el.find("#"+activeContent).removeClass("active");
      }

      //add active class to clicked element
      var spanID = $(selectElement).find("span.content-id").html();
      $(selectElement).addClass("active");

      if(selByClass) {
        activeAlphabetContentDiv = container.find("div."+spanID);
      } else {
        activeAlphabetContentDiv = panel.el.find("#"+spanID);
      }

      activeAlphabetContentDiv.addClass("active");


      // Move to the first available tab if current selected tab has gone inactive after filtering
      var contentId = $('.content-id', selectElement).html();
      var tabs = $('#'+contentId + ' .tabs div.track-tab', panel.elLk.trackPanel);
      if (tabs.length && !tabs.hasClass('active')) {
        if (tabs.not('.inactive').length) {
          var firstActiveTab = tabs.not('.inactive')[0];
          var contentId = $('.content-id', firstActiveTab).html();
          var firstActiveTabContent = $('#'+ contentId, panel.elLk.trackPanel);
          $(firstActiveTab).addClass('active');
          $(firstActiveTabContent).addClass('active');
        }
      }

      if (resetRibbonOffset) {
        $(selectElement).closest('.letters-ribbon').data({'reset': true});
      }

      activeAlphabetContentDiv = panel.elLk.trackPanel.find('div.ribbon-content .alphabet-content.active');
      $.each(activeAlphabetContentDiv, function(i, el) {
        var activeLetterDiv = $(el).closest('.tab-content').find('div.alphabet-div.active');

        // Reset is applied on filterData() if an offset reset is needed for the ribbon
        if ($(activeLetterDiv).closest('.letters-ribbon').data('reset') && ($(selectElement).hasClass('track-tab') || searchTriggered)  && !noOffsetUpdate) {
          var availableAlphabets = panel.getActiveAlphabets();
          var activeAlphabetDiv = availableAlphabets.filter(function(){return $(this).hasClass('active');});
          var activeAlphabetIndex = $(activeLetterDiv).parent().children().index(activeAlphabetDiv);
          var bannerOffset = $(activeLetterDiv).closest('.ribbon-banner').offset();

          // tab containing ribbon need to be visible to get the offset value.
          if ($(activeLetterDiv).closest('.ribbon-banner').closest('.tab-content').css('display') !== 'none') {
            var lettersSkipped = activeAlphabetIndex * 22;
            newOffset =  (bannerOffset.left - lettersSkipped + 10);
            $(activeLetterDiv).closest('.letters-ribbon').offset({left: newOffset});
            // Remove reset once the offset is applied.
            $(activeLetterDiv).closest('.letters-ribbon').removeData('reset');
          }
        }

        if (activeLetterDiv.offset() && !noOffsetUpdate) {
          // change offset positions of all letter content divs same as their respecitve ribbon letter div
          $(el).offset({left: activeLetterDiv.offset().left - 2});
        }
      })
    }
  },

  //function to change the tab in the breadcrumb and show the appropriate content
  toggleBreadcrumb: function(element) {
    var panel = this;

    panel.toggleTab({'selectElement': element, 'container': panel.el.find("div.large-breadcrumbs")});
    panel.toggleButton();
    panel.elLk.resetTrackButton.show(); //showing reset tracks button on select tracks tab
    if($(element).hasClass('_configure') && !$(element).hasClass('inactive')) { panel.emptyMatrix(); panel.displayMatrix(); }
  },

  toggleButton: function() {
    var panel = this;
    
    if(panel.el.find('div.track-configuration:visible').length){
      panel.el.find('button.view-track').addClass('active');
      panel.el.find('button.showMatrix').addClass("_edit").outerWidth("100px").html("View tracks");
    } else {
      panel.el.find('button.view-track').removeClass('active');
      panel.el.find('button.showMatrix').outerWidth(panel.buttonOriginalWidth).html(panel.buttonOriginalHTML).removeClass("_edit");
    }
  },

  //function to display filters (checkbox label), it can either be inside a letter ribbon or just list
  displayCheckbox: function(obj) {

    var data = obj.data
    var container = obj.container;
    var listType = obj.listType;
    var parentTabContainer = obj.parentTabContainer;
    var parentRhSectionId = obj.rhSectionId;
    var noFilter_allBox = obj.noFilter;
    var set = obj.set || '';

    var panel       = this;
    var ribbonObj   = {};
    var countFilter  = 0;

    if(listType && listType === "alphabetRibbon") {

      //creating obj with alphabet key (a->[], b->[],...)
      $.each(data.sort(), function(j, item) {
        var firstChar = item.charAt(0).toLowerCase();
        if(!ribbonObj[firstChar]) {
          ribbonObj[firstChar] = [];
          ribbonObj[firstChar].push(item);
        } else {
          ribbonObj[firstChar].push(item);
        }
      });
      panel.alphabetRibbon(ribbonObj, container, parentTabContainer, parentRhSectionId, noFilter_allBox, set);
    } else  {
      var container = panel.el.find(container);
      var html = '<ul class="letter-content list-content _drag_select_zone">';
      var rhsection = container.find('span.rhsection-id').html();
      data = data.sort();
      $.each(data, function(i, item) {
        if(item) {
          var elementClass = item.replace(/[^\w\-]/g,'_');//this is a unique name and has to be kept unique (used for interaction between RH and LH panel and also for cell and experiment filtering)
          html += '<li class="noremove '+ elementClass + '" data-parent-tab="' + rhsection + '" data-item="' + elementClass +'"><span class="fancy-checkbox"></span><text>'+item+'</text></li>';
        }
        countFilter++;
        panel.elLk.lookup[elementClass] = {
          label: item,
          parentTab: parentTabContainer,
          parentTabId: parentRhSectionId,
          subTab: rhsection,
          selected: false,
          set: set || ''
        };

      });
      html += '</ul>';
      html = '<div class="all-box list-all-box" id="allBox-'+$(container).attr("id")+'"><span class="fancy-checkbox"></span>Select all<text class="_num">('+countFilter+')</text></div>' + html; 
      container.append(html);

      // Adding the element itself to the lookup
      $.each(data, function(i, item) {
        if(item) {
          var elementClass = item.replace(/[^\w\-]/g,'_');//this is a unique name and has to be kept unique (used for interaction between RH and LH panel and also for cell and experiment filtering)
          panel.elLk.lookup[elementClass].el = container.find("." + elementClass);
        }
      });
      
      //updating available count in right hand panel
      panel.el.find('div#'+rhsection+' span.total').html(countFilter);

      //clicking select all checkbox
      panel.clickCheckbox(container.find("div.all-box"));
    }
  },
  
  //function to add dx and dy in data-filter attribute which link the dx checkbox to the dy checkbox and vice versa, used for filtering to show/hide checkboxes
  addRelationData: function () {
    var panel = this;

    $.each(panel.json.data[panel.dx].data, function(key, dx_data) {
      var dx_className = key.replace(/[^\w\-]/g,'_');
      panel.elLk.lookup[dx_className].data = dx_data;
      //add dy attribute to dx
      var relClassNameString="";
      $.each(dx_data, function(index, el) {
        var relClassName = el.val.replace(/[^\w\-]/g,'_');
        relClassNameString += relClassName + " ";
        
        //adding cells atribute to experiments
        var relDataFilter = panel.el.find("li."+relClassName).attr('data-filter');
        relDataFilter ?  panel.el.find("li."+relClassName).attr('data-filter', relDataFilter+" "+dx_className) :  panel.el.find("li."+relClassName).attr('data-filter', dx_className);

        if(!panel.el.find("li."+relClassName).attr('data-filtercontainer')){
          panel.el.find("li."+relClassName).attr('data-filtercontainer', 'dx-content');
        } 
      });
      //data-filter contains the classname that needs to be shown and data-filtercontainer is the id where elements to be shown are located
      panel.el.find("li."+dx_className).attr('data-filter', relClassNameString).attr('data-filtercontainer', 'dy-content');

    });
  },

  // Function that does internal filtering to show/hide other dimension's checkboxes based on a checkbox selection.
  // This will also do the activation/inactivation of tabs based on availability
  // Arguments: selected element item name
  filterData: function(item) {
    var panel = this;

    if (!item) return;

    var tabA_container = $(panel.elLk.lookup[item].parentTab, panel.el);
    var tabB_containerId = '#' + $('.' + item, panel.elLk.trackPanel).data('filtercontainer');
    var tabB_LIs = panel.el.find(tabB_containerId).find('li');

    var filters = {};
    tabA_container.find('li span.fancy-checkbox.selected').parent().map(function(){
      if ($(this).data('filter')) {
        $(this).data('filter').split(' ').map(function(f) {
          if (f!== '') {
            filters[f] = 1;
          }
        });
      }
    })

    // Hide all first and then show based on filters
    tabB_LIs.hide();

    var filters_class = '';
    // Create classees with all filters for selection below
    if (Object.keys(filters).length) {
      filters_class = 'li.' + Object.keys(filters).join(', li.');
      panel.elLk.trackPanel.find(tabB_containerId).find(filters_class).addClass('_filtered').show();

      // Unselect any lis which went hidden after filtering
      tabB_LIs.not('._filtered').find('span.fancy-checkbox').removeClass('selected');
    }
    else {
      // If no filters, then show all LIs in tabB
      tabB_LIs.removeClass('_filtered').show();      
    }

    var resetCount = filters_class === '' ? 1 : 0;

    var tabToFilter = {
      'dx': 'dy',
      'dy': 'dx'
    }
    panel.updateAvailableTabsOrRibbons(tabToFilter[panel.elLk.lookup[item].parentTabId]);
  },

  getActiveAlphabets: function(container) {
    var panel = this;
    container = container || this.getActiveTabContainer();
    return $(container).find('.ribbon-banner div.alphabet-div').not('.inactive');
  },

  // Function to create letters ribbon with left and right arrow (< A B C ... >) and add elements alphabetically
  // Arguments: data: obj of the data to be added with obj key being the first letter pointing to array of elements ( a -> [], b->[], c->[])
  //            Container is where to insert the ribbon
  alphabetRibbon: function (data, container, parentTabContainer, parentRhSectionId, noFilter_allBox, set) {

    var panel = this;
    var html  = "";
    var content_html = "";
    var total_num = 0;
    var container = panel.el.find(container);
    var rhsection = container.find('span.rhsection-id').html();

    //generate alphabetical order ribbon (A B C D ....)
    $.each(new Array(26), function(i) {
      var letter = String.fromCharCode(i + 97);
      var active_class = "";
      var letterHTML   = "";
      
      if(i === 0) { active_class = "active"; } //TODO: check the first letter that there is data and then add active class

      if(data[letter] && data[letter].length) {
        letterHTML = '<ul class="letter-content _drag_select_zone">';
        $.each(data[letter], function(i, el) {
          total_num++;
          var elementClass = el.replace(/[^\w\-]/g,'_');//this is a unique name and has to be kept unique (used for interaction between RH and LH panel and also for cell and experiment filtering)
          letterHTML += '<li class="noremove ' + elementClass + '" data-parent-tab="' + rhsection + '" data-item="' + elementClass + '"><span class="fancy-checkbox"></span><text>'+el+'</text></li>';

          panel.elLk.lookup[elementClass] = {
            label: el,
            parentTab: parentTabContainer,
            parentTabId: parentRhSectionId,
            subTab: rhsection,
            selected: false,
            set: set
          };
        });
        letterHTML += '</ul>';
      } else {
        active_class = "inactive";
      }

      html += '<div class="ribbon_'+letter+' alphabet-div '+active_class+'">'+letter.toUpperCase()+'<span class="hidden content-id">'+letter+'_content</span></div>';
      content_html += '<div data-ribbon="ribbon_'+letter+'" class="'+letter+'_content alphabet-content '+active_class+'">'+letterHTML+'</div>';
    });
    var noFilterClass = noFilter_allBox ? 'no-filter' : '';
    container.append('<div class="all-box '+ noFilterClass +'" id="allBox-'+$(container).attr("id")+'"><span class="fancy-checkbox"></span>Select all<text>(A-Z)</text></div><div class="cell-listing"><div class="ribbon-banner"><div class="larrow inactive">&#x25C0;</div><div class="alpha-wrapper"><div class="letters-ribbon"></div></div><div class="rarrow">&#x25B6;</div></div><div class="ribbon-content"></div></div>');
    container.find('div.letters-ribbon').append(html);
    container.find('div.ribbon-content').append(content_html);

    // Adding element itself to the lookup
    $.each(new Array(26), function(i) {
      var letter = String.fromCharCode(i + 97);
      if(data[letter] && data[letter].length) {
        $.each(data[letter], function(i, el) {
          total_num++;
          var elementClass = el.replace(/[^\w\-]/g,'_');//this is a unique name and has to be kept unique (used for interaction between RH and LH panel and also for cell and experiment filtering)
          panel.elLk.lookup[elementClass].el = container.find('.' + elementClass);
        });
      }
    });

    //updating available count in right hand panel
    panel.el.find('div#'+rhsection+' span.total').html(total_num);
    
    //clicking select all checkbox
    panel.clickCheckbox(container.find("div.all-box"));
   
    //clicking the alphabet
    var alphabet = container.find('div.alphabet-div');      
    alphabet.on("click", function(){
      if (!$(container, panel.el).hasClass('active')) {
        return;
      }
      $.when(
        panel.toggleTab({'selectElement': this, 'container': container, 'selByClass': 1})
      ).then(
        panel.selectArrow(container)
      );
    });
  },

  selectArrow: function(container) {
    var panel = this;
    var activeAlphabets = panel.getActiveAlphabets(container);
    var startLetter = $(activeAlphabets.get(0)).html().charAt(0);
    var endLetter   = $(activeAlphabets.get(-1)).html().charAt(0);
    if (!activeAlphabets.length) return;

    if($('div.alphabet-div.active', container).html().match(startLetter)) { 
      $('div.larrow', container).removeClass("active").addClass("inactive");
      $('div.rarrow', container).removeClass("inactive").addClass("active"); //just in case jumping from Z to A
    } else if($('div.alphabet-div.active', container).html().match(endLetter)) { 
      $('div.rarrow', container).removeClass("active").addClass("inactive");
      $('div.larrow', container).removeClass("inactive").addClass("active"); //just in case jumping from A to Z
    }else {
      $('div.larrow, div.rarrow', container).removeClass("inactive").addClass("active");
    }
  },

  registerRibbonArrowEvents: function() {
    var panel = this;
    //clicking the left and right arrow
    panel.elLk.arrows   = $('div.rarrow, div.larrow', panel.elLk.trackPanel);
    panel.elLk.arrows.off().on("click", function(e){
      container = $(e.target).closest('.tab-content');
      var ribbonBanner = container.find('.letters-ribbon');
      var ribbonContent = container.find('.ribbon-content');
      var availableAlphabets = panel.getActiveAlphabets(container);
      var activeAlphabetDiv = availableAlphabets.filter(function(){return $(this).hasClass('active');});
      var activeAlphabetIndex = availableAlphabets.index(activeAlphabetDiv);
      var activeAlphabet = activeAlphabetDiv.html().charAt(0).toLowerCase();
      var activeTabId = panel.getActiveTab() + '-tab';

      if (!$(container).hasClass('active') && !$('#' + activeTabId, panel.elLk.trackPanel).hasClass('active')) {
        return; // run only for the active tab
      }

      if(!this.className.match(/inactive/gi)) {
        if(this.className.match(/larrow/gi)) {
          if (!availableAlphabets[activeAlphabetIndex-1]) return;

          //get previous letter 
          var prevLetter = $(availableAlphabets[activeAlphabetIndex-1]).html().charAt(0).toLowerCase();
          // Get total letters skipped to adjust offset (charcode(currentletter - prevLetter))
          var lettersSkipped = activeAlphabet.charCodeAt(0) - prevLetter.charCodeAt(0);

          $.when(
            panel.toggleTab({'selectElement': ribbonBanner.find("div.ribbon_"+prevLetter), 'container': container, 'selByClass': 1})
          ).then(
            panel.selectArrow(container)
          );

          var prevLetterDiv = ribbonBanner.find('.ribbon_'+prevLetter);

          if(prevLetterDiv.offset().left <= $(e.target).offset().left + 22) {
            ribbonBanner.offset({left: ribbonBanner.offset().left + (22 * lettersSkipped)});
            var prevletterContentDiv = ribbonContent.find("div."+prevLetter+"_content.alphabet-content");
            prevletterContentDiv.offset({left: prevletterContentDiv.offset().left + (22 * lettersSkipped)});
          }

          // Checking the distance of larrow and first alphabet
          if (ribbonBanner.find('.ribbon_a').offset().left > $(e.target).offset().left + 22) {
            panel.activateAlphabetRibbon(container, true);
          }
        }

        if (this.className.match(/rarrow/gi)) {
          if (!availableAlphabets[activeAlphabetIndex+1]) return;

          var nextLetter = $(availableAlphabets[activeAlphabetIndex+1]).html().charAt(0).toLowerCase();
          // Get total letters skipped to adjust offset (charcode(nextletter-currentletter))
          var lettersSkipped = nextLetter.charCodeAt(0) - activeAlphabet.charCodeAt(0);

          $.when(
            panel.toggleTab({'selectElement': ribbonBanner.find("div.ribbon_"+nextLetter), 'container': container, 'selByClass': 1})
          ).then(
            panel.selectArrow(container)
          );

          var nextLetterDiv = ribbonBanner.find('.ribbon_'+nextLetter);
          if(nextLetterDiv.offset().left  >= $(e.target).offset().left - 44) {
            ribbonBanner.offset({left: ribbonBanner.offset().left - (22 * lettersSkipped)});
            var nextletterContentDiv = ribbonContent.find("div."+nextLetter+"_content.alphabet-content");
            nextletterContentDiv.offset({left: nextletterContentDiv.offset().left - (22 * lettersSkipped)});
          }
        }
      }
      
    });
  },

  //function to find out which dimension dyItem belong to (used to know which state object to use; dimensions = matrix, extra_dimensions = array key)
  itemDimension: function(item){
    var panel = this;

    if(item.match("_sep_")){
      item = item.split("_sep_")[0];
    }
    if(panel.json.extra_dimensions.indexOf(item) >= 0) {
      return panel.json.extra_dimensions[panel.json.extra_dimensions.indexOf(item)];
    }  else {
      return "matrix"; //object name for matrix state object
    }
  },
  
  // Function to show/update/delete matrix
  displayMatrix: function() {
    var panel = this;

    panel.trackPopup = panel.el.find('div.track-popup');
    panel.elLk.resetTrackButton.hide(); //hiding reset tracks button (only visible on select tracks tab)

    var xContainer = '<div  class="xContainer">';
    
    //creating array of dy from lookup Obj. ; this will make sure the order is the same
    var dyArray = panel.localStoreObj.dy ? Object.keys(panel.localStoreObj.dy) : [];;

    // Add empty column
    if(panel.localStoreObj.dy) { dyArray.unshift(''); }

    // Adding 2 extra regulatory features tracks to show by default
    panel.json.extra_dimensions.sort().reverse().forEach(function(k) {
      dyArray.unshift(k);
    })

    // creating dy label on top of matrix
    $.each(dyArray, function(i, dyItem){
      var dyLabel = panel.elLk.lookup[dyItem] ? panel.elLk.lookup[dyItem].label : dyItem;
      if (dyItem === '') {
        xContainer += '<div class="xLabel x-label-gap">'+dyLabel+'</div>';
      }
      else {
        if(!panel.localStoreObj[panel.itemDimension(dyItem)][dyItem]) {
          //initialising state obj for dyItem (column), value setup later
          panel.localStoreObj[panel.itemDimension(dyItem)][dyItem] = {"total": 0, "state": { "on": 0, "off": 0, "reset-on": 0, "reset-off": 0 }, "renderer": {"peak": 0, "peak-signal": 0, "signal": 0, "normal": 0, "reset-peak":0, "reset-peak-signal": 0, "reset-signal": 0, "reset-normal": 0} };
        }
        xContainer += '<div class="xLabel '+dyItem+'">'+dyLabel+'</div>';
      }
    });

    xContainer += "</div>";
    panel.el.find('div.matrix-container').append(xContainer);

    var yContainer = '<div class="yContainer">';
    var boxContainer = '<div class="boxContainer">';
    //creating cell label with the boxes (number of boxes per row = number of experiments)
    $.each(panel.localStoreObj.dx, function(cellName, value){
        var cellLabel    = panel.elLk.lookup[cellName].label || cellName;
        var dxCount = 0, peakSignalCount = 0, onState = 0, offState = 0;

        if(!panel.localStoreObj[panel.itemDimension(cellName)][cellName]) {
          if(panel.itemDimension(cellName) === "matrix") {
            panel.localStoreObj[panel.itemDimension(cellName)][cellName] = {"total": 0,"state": { "on": 0, "off": 0, "reset-on": 0, "reset-off": 0 }, "renderer": { "peak": 0, "signal": 0, "normal": 0, "peak-signal": 0, "reset-peak":0, "reset-peak-signal": 0, "reset-signal": 0}};
          }
        }

        yContainer += '<div class="yLabel _ht '+cellName+'" title="'+cellName+'">'+cellLabel+'</div>';
        var rowContainer  = '<div class="rowContainer">'; //container for all the boxes/cells
        
        //drawing boxes
        $.each(dyArray, function(i, dyItem) {
          if (dyItem === '') {
            rowContainer += '<div class="xBoxes _emptyBox_'+cellName+'"></div>';
          }
          else {
            var boxState  = "", boxDataRender = "";
            var popupType = "peak-signal"; //class of type of popup to use
            var dataClass = ""; //to know which cell has data
            var boxRenderClass = "";
            var storeKey = dyItem + "_sep_" + cellName; //key for identifying cell is joining experiment(x) and cellname(y) name with _sep_ 
            var renderer, rel_dimension;
            
            var cellStoreObjKey = panel.itemDimension(storeKey);
            var dyStoreObjKey   = panel.itemDimension(dyItem);
            var matrixClass     = cellStoreObjKey === "matrix" ? cellStoreObjKey : "";

            if(panel.localStoreObj[cellStoreObjKey][storeKey]) {
              boxState   = panel.localStoreObj[cellStoreObjKey][storeKey].state;
              boxDataRender  = panel.localStoreObj[cellStoreObjKey][storeKey].renderer;
              popupType = panel.localStoreObj[cellStoreObjKey][storeKey].popupType || popupType;
              boxRenderClass = "render-"+boxDataRender;
              dataClass = "_hasData";
            } else {
              //check if there is data or no data with cell and experiment (if experiment exist in cell object then data else no data )
              $.each(panel.json.data[panel.dx].data[cellLabel], function(cellKey, relation){
                if(relation.val.replace(/[^\w\-]/g,'_').toLowerCase() === dyItem.toLowerCase()) {
                  dataClass = "_hasData";
                  rel_dimension = relation.dimension;
                  popupType = panel.json.data[rel_dimension].popupType || popupType;
                  renderer = panel.json.data[rel_dimension].renderer;
                  boxState = relation.defaultState || panel.elLk.lookup[dyItem].defaultState; //on means blue bg, off means white bg
                  boxDataRender = renderer || panel.elLk.lookup[dyItem].renderer;
                  boxRenderClass = "render-" + boxDataRender; // peak-signal = peak_signal.svg, peak = peak.svg, signal=signal.svg
                  panel.localStoreObj[cellStoreObjKey][storeKey] = {"state": boxState, "renderer": boxDataRender, "popupType": popupType, "reset-state": boxState, "reset-renderer": boxDataRender};
                  
                  //setting count to update column state (dy)
                  panel.localStoreObj[dyStoreObjKey][dyItem]["total"] += 1;
                  panel.localStoreObj[dyStoreObjKey][dyItem]["renderer"][boxDataRender] += 1;
                  panel.localStoreObj[dyStoreObjKey][dyItem]["renderer"]["reset-"+boxDataRender] += 1;
                  panel.localStoreObj[dyStoreObjKey][dyItem]["state"][boxState.replace("track-","")]++;
                  panel.localStoreObj[dyStoreObjKey][dyItem]["state"]["reset-"+boxState.replace("track-","")]++;

                  //calculating total in one row, we only want dy item not the extra dimensions for the matrix state obj.
                  if(panel.json.extra_dimensions.indexOf(dyItem) === -1) {
                    dxCount++; 
                    peakSignalCount++;
                    if(boxState === "track-on") { 
                      onState++; 
                    } else {
                      offState++;
                    }                                       
                  }                  
                  return;
                }
              });              
            }

            rowContainer += '<div class="xBoxes '+boxState+' '+matrixClass+' '+boxRenderClass+' '+dataClass+' '+cellName+' '+dyItem+'" data-track-x="'+dyItem+'" data-track-y="'+cellName+'" data-popup-type="'+popupType+'"></div>';            
          }
        });
        //setting state for row in matrix
        panel.localStoreObj.matrix[cellName]["total"] += dxCount;
        panel.localStoreObj.matrix[cellName]["state"]["on"] += onState
        panel.localStoreObj.matrix[cellName]["state"]["reset-on"] += onState
        panel.localStoreObj.matrix[cellName]["state"]["off"] += offState
        panel.localStoreObj.matrix[cellName]["state"]["reset-off"] += offState
        panel.localStoreObj.matrix[cellName]["renderer"]["peak-signal"] += peakSignalCount;
        panel.localStoreObj.matrix[cellName]["renderer"]["reset-peak-signal"] += peakSignalCount;

        rowContainer += "</div>";
        boxContainer += rowContainer;
    });
    yContainer += "</div>";
    boxContainer += "</div>";

    var yBoxWrapper = '<div class="yBoxWrapper">' + yContainer + boxContainer + '</div>';

    panel.el.find('div.matrix-container').append(yBoxWrapper);

    // Setting width of xContainer and yBoxWrapper (32px width box times number of xlabels)
    var hwidth = (dyArray.length * 32);
    panel.el.find('div.matrix-container .xContainer, div.matrix-container .yBoxWrapper').width(hwidth);

    panel.cellClick(); //opens popup
    panel.cleanMatrixStore(); //deleting items that are not present anymore
    panel.setLocalStorage();
    
    // enable helptips
    this.elLk.matrixContainer.find('._ht').helptip({position: { at: 'right center', using: function(position, feedback){     
      position.left -= 20;
      $(this).removeClass('helptip-top helptip-bottom helptip-middle').addClass('helptip-' + feedback.vertical).css(position);}} 
    });
  },

  emptyMatrix: function() {
    var panel = this;

    panel.el.find('div.matrix-container').html('');
  },

  cleanMatrixStore: function() {
    var panel = this;

    var dimensionsArray = ["matrix"];
    var dyItems         =  $.extend({}, panel.localStoreObj.dy);
    $.map(panel.json.extra_dimensions, function(extraItem) {
      dyItems[extraItem] = 1;
    });

    $.each($.merge(dimensionsArray, panel.json.extra_dimensions), function(i,storeKey){
      $.each(panel.localStoreObj[storeKey], function(item, data) {
        if(!item.match("_sep_")) {
          if(!dyItems[item] && !panel.localStoreObj.dx[item]) {
            panel.removeFromMatrix(item);
          }
        }
      });
    });
  },

  resetMatrix: function() {
    var panel = this;
    
    this.elLk.resetMatrixButton = panel.elLk.trackConfiguration.find('button.reset-button._matrix');

    this.elLk.resetMatrixButton.click("on", function() {
      var allStoreObjects = $.extend({}, panel.localStoreObj.matrix);
      $.each(panel.json.extra_dimensions,function(i, dim){
        $.extend(allStoreObjects, panel.localStoreObj[dim]);
      });

      Object.keys(allStoreObjects).map(function(key) {
        var storeObjKey = panel.itemDimension(key);
        if(key.match("_sep_")) {
          var currentState    = allStoreObjects[key]["state"];
          var currentRenderer = allStoreObjects[key]["renderer"]; 
          var resetState      = allStoreObjects[key]["reset-state"];
          var resetRenderer   = allStoreObjects[key]["reset-renderer"];

          panel.elLk.matrixContainer.find('div.xBoxes.'+key.split("_sep_")[0]+'.'+key.split("_sep_")[1]).removeClass(currentState).addClass(resetState);
          panel.elLk.matrixContainer.find('div.xBoxes.'+key.split("_sep_")[0]+'.'+key.split("_sep_")[1]).removeClass("render-"+currentRenderer).addClass("render-"+resetRenderer);

          panel.localStoreObj[storeObjKey][key]["state"]    = resetState;
          panel.localStoreObj[storeObjKey][key]["renderer"] = resetRenderer;
        } else {          
          panel.localStoreObj[storeObjKey][key]["state"]["on"]              = allStoreObjects[key]["state"]["reset-on"];
          panel.localStoreObj[storeObjKey][key]["state"]["off"]             = allStoreObjects[key]["state"]["reset-off"];
          panel.localStoreObj[storeObjKey][key]["renderer"]["peak"]         = allStoreObjects[key]["renderer"]["reset-peak"];
          panel.localStoreObj[storeObjKey][key]["renderer"]["signal"]       = allStoreObjects[key]["renderer"]["reset-signal"];
          panel.localStoreObj[storeObjKey][key]["renderer"]["peak-signal"]  = allStoreObjects[key]["renderer"]["reset-peak-signal"];
          panel.localStoreObj[storeObjKey][key]["renderer"]["normal"]       = allStoreObjects[key]["renderer"]["reset-normal"];
        }
      });
    });
  },

  resetTracks: function() {
    var panel = this;

    this.elLk.resetTrackButton = panel.elLk.resultBox.find('button.reset-button._track');

    this.elLk.resetTrackButton.click("on", function() {
      panel.localStoreObj.dx     = {};
      panel.localStoreObj.dy     = {};
      panel.localStoreObj.matrix = {};
      panel.setLocalStorage();
      panel.emptyMatrix();
      $.each(panel.el.find('div.result-box').find('li').not(".noremove"), function(i, ele){
        panel.selectBox(ele);
        panel.filterData($(ele).data('item'));
      });
      panel.updateRHS();
    });
  },

  cellClick: function() {
    var panel = this;

    panel.elLk.rowContainer = this.elLk.matrixContainer.find('div.rowContainer');
    panel.popupType      = "";
    panel.TrackPopupType = "";
    panel.xLabel         = "";
    panel.yLabel         = "";
    panel.xName          = "";
    panel.yName          = "";
    panel.boxObj         = "";

    panel.el.find('div.matrix-container div.xBoxes.track-on, div.matrix-container div.xBoxes.track-off').on("click", function(e){
      panel.el.find('div.matrix-container div.xBoxes.track-on.mClick, div.matrix-container div.xBoxes.track-off.mClick').removeClass("mClick");
      panel.trackPopup.hide();
      
      panel.boxObj          = $(this);
      panel.popupType       = $(this).data("popup-type"); //type of popup to use which is associated with the class name
      panel.TrackPopupType  = panel.el.find('div.track-popup.'+panel.popupType);
      panel.xName           = $(this).data("track-x");
      panel.yName           = $(this).data("track-y");
      panel.xLabel          = $(panel.elLk.rowContainer.find('div.xLabel.'+panel.xName));
      panel.yLabel          = $(panel.elLk.rowContainer.find('div.yLabel.'+panel.yName));
      panel.cellKey         = panel.xName+"_sep_"+panel.yName;
      panel.cellStateKey    = panel.itemDimension(panel.cellKey) || "";
      panel.dyStateKey      = panel.itemDimension(panel.yName) || "";
      panel.dxStateKey      = panel.itemDimension(panel.xName) || "";
      
      var boxState  = panel.localStoreObj[panel.cellStateKey][panel.cellKey].state; //is the track on or off
      var boxRender = panel.localStoreObj[panel.cellStateKey][panel.cellKey].renderer; //is the track peak or signal or peak-signal
      var rowState  = panel.localStoreObj[panel.dyStateKey][panel.yName].state.off === panel.localStoreObj[panel.dyStateKey][panel.yName].total ? "track-off" : "track-on"; // get the equivalent ylabel first and then its state to determine whether row is on/off
      var colState  = panel.localStoreObj[panel.dxStateKey][panel.xName].state.off === panel.localStoreObj[panel.dxStateKey][panel.xName].total ? "track-off" : "track-on"; // get the equivalent xlabel first and then its state to determine whether column is on/off
            
      var rowRender = "";
      $.map(panel.localStoreObj[panel.dyStateKey][panel.yName].renderer, function(count, rendererType){
        if(!rendererType.match("reset-") && count === panel.localStoreObj[panel.dyStateKey][panel.yName].total) {
          rowRender = rendererType;
          return;
        }
      });      
      var colRender = "";
      $.map(panel.localStoreObj[panel.dxStateKey][panel.xName].renderer, function(count, rendererType){
        if(!rendererType.match("reset-") && count === panel.localStoreObj[panel.dxStateKey][panel.xName].total) {
          colRender = rendererType;
          return;
        }
      });       

      $(this).addClass("mClick");

      //setting column switch for whether it is on/off
      if(colState === "track-on") {
        panel.TrackPopupType.find('ul li label.switch input[name="column-switch"]').prop("checked",true);
      } else {
        panel.TrackPopupType.find('ul li label.switch input[name="column-switch"]').prop("checked",false);
      }

      //setting radio button for column render
      if(colRender) {
        panel.TrackPopupType.find('ul li input[name=column-radio]._'+colRender).prop("checked",true);
      } else {
        panel.TrackPopupType.find('ul li input[name=column-radio]').prop("checked",false);
      }      

     //setting row switch for whether it is on/off
      if(rowState === "track-on") {
        panel.TrackPopupType.find('ul li label.switch input[name="row-switch"]').prop("checked",true);
      } else {
        panel.TrackPopupType.find('ul li label.switch input[name="row-switch"]').prop("checked",false);
      }

      //setting radio button for cell render
      if(rowRender) {
        panel.TrackPopupType.find('ul li input[name=row-radio]._'+rowRender).prop("checked",true);
      } else {
        panel.TrackPopupType.find('ul li input[name=row-radio]').prop("checked",false);
      }

      //setting box/cell switch on/off
      if(boxState === "track-on") {
        panel.TrackPopupType.find('ul li label.switch input[name="cell-switch"]').prop("checked",true);
      } else {
        panel.TrackPopupType.find('ul li label.switch input[name="cell-switch"]').prop("checked",false);
      }

      //setting radio button for cell render
      if(boxRender) {
        panel.TrackPopupType.find('ul li input[name=cell-radio]._'+boxRender).prop("checked",true);
      } else {
        panel.TrackPopupType.find('ul li input[name=cell-radio]').prop("checked",false);
      }

      //center the popup on the box, get the x and y position of the box and then add half the length
      //populating the popup settings (on/off, peak, signals...) based on the data attribute value
      panel.TrackPopupType.attr("data-track-x",$(this).data("track-x")).attr("data-track-y",$(this).data("track-y")).css({'top': ($(this)[0].offsetTop - $('div.matrix-container')[0].scrollTop) + 15,'left': ($(this)[0].offsetLeft - $('div.matrix-container')[0].scrollLeft) + 15}).show();

      panel.popupFunctionality(); //interaction inside popup
      e.stopPropagation();
    });
  },

  //function to update the store obj when clicking the on/off or renderers
  updateTrackStore: function(storeObj, trackKey, newState, currentState, newRenderer, currentRenderer){
    var panel = this;

    var statusKey   = newState ? "state" : "renderer";
    var newValue    = newState ?  newState.replace("track-","") : newRenderer;
    var currValue   = currentState ?  currentState.replace("track-","") : currentRenderer;
    var keyDim      = panel.itemDimension(trackKey);
    //console.log("STATUSKEY:"+statusKey+">>newValue>>"+newValue+">>TrackKey>>"+trackKey)

    //update cell in store obj and update count for affected row/column
    if(trackKey.match("_sep_")) {
      storeObj[statusKey] = newState ?  newState : newRenderer;

      $.each(trackKey.split("_sep_"), function(i, splitTrack){
        if(panel.localStoreObj[panel.dxStateKey][splitTrack][statusKey][newValue] < panel.localStoreObj[panel.dxStateKey][splitTrack]["total"]) { panel.localStoreObj[panel.dxStateKey][splitTrack][statusKey][newValue] += 1; }
        if(panel.localStoreObj[panel.dxStateKey][splitTrack][statusKey][currValue] > 0) { panel.localStoreObj[panel.dxStateKey][splitTrack][statusKey][currValue] -= 1; };
        if(keyDim != "matrix") { return false; }
      });

    } else {  //if it is row or column, set new state/renderer type to total count and the previous state/renderer to 0, and for each affected row/column update the count
      $.each(storeObj[statusKey], function(rendererType, val){
        if(rendererType === newValue) {
          storeObj[statusKey][rendererType] = storeObj["total"];
        } else {
          if(!rendererType.match("reset-")) {
            storeObj[statusKey][rendererType] = 0;
          }
        }
      });

      //update each affected row or column state/renderer type(-1 from current, +1 for new)
      Object.keys(panel.localStoreObj[keyDim]).filter(function(key){ 
        //find associated track with the trackKey (only the one with _sep_)         
        if(key.match(trackKey) && key.match("_sep_")) {
          //console.log("KEY>>>>"+key)
          //updating the associated one only not the trackKey (only do this for matrix)
          if(keyDim === "matrix") {
            $.grep(key.split("_sep_"), function(associatedEle, i){
              // console.log(keyDim+">>>>"+associatedEle);
              // console.log(panel.localStoreObj[keyDim][key][statusKey]);

              var cellCurrValue = panel.localStoreObj[keyDim][key][statusKey];
              var cellNewValue  = newState ? newState : newRenderer;

              if(associatedEle != trackKey && cellCurrValue != cellNewValue ) {
                if(panel.localStoreObj[keyDim][associatedEle][statusKey][newValue] < panel.localStoreObj[keyDim][associatedEle]["total"]) { panel.localStoreObj[keyDim][associatedEle][statusKey][newValue] += 1; }
                if(panel.localStoreObj[keyDim][associatedEle][statusKey][cellCurrValue] > 0) { panel.localStoreObj[keyDim][associatedEle][statusKey][cellCurrValue] -= 1; }
              }
            });
          }
          //updating each cell in the store
          panel.localStoreObj[keyDim][key][statusKey] = newState ? newState : newRenderer;
        }
      });        
    }
    panel.setLocalStorage();
  },

  //function to handle functionalities inside popup (switching off track or changing renderer) and updating state (localstore obj)
  //Argument: Object of the cell/box clicked
  popupFunctionality: function() {
    var panel = this;

    //choosing toggle button - column-switch/row-switch/cell-switch
    //if column is off, set data-track-state to track-off in xLabel, if row is off, set data-track-state to track-off in yLabel, if cell is off set data-track-state to track-off in xBox
    //update localstore obj
    panel.TrackPopupType.find('ul li label.switch input[type=checkbox]').off().on("click", function(e) {
      var switchName    = $(this).attr("name");
      var trackState    = $(this).is(":checked") ? "track-on" : "track-off";
      var currentState  = trackState === "track-on"  ? "track-off" : "track-on"; 

      if(switchName === "column-switch") {
        //update bg for all cells in the column and also switch cell off
        panel.elLk.rowContainer.find('div.xBoxes.'+panel.xName+'.'+currentState).removeClass(currentState).addClass(trackState);        
        panel.TrackPopupType.find('ul li label.switch input[name="cell-switch"]').prop("checked", trackState === "track-on" ? true : false);

        //update localstore for column
        panel.updateTrackStore(panel.localStoreObj[panel.dxStateKey][panel.xName], panel.xName, trackState, currentState);

      } else if(switchName === "row-switch") {
        //update bg for all cells in the row belonging to matrix only and also switch cell off        
        panel.elLk.rowContainer.find('div.xBoxes.matrix.'+panel.yName+'.'+currentState).removeClass(currentState).addClass(trackState);
        panel.TrackPopupType.find('ul li label.switch input[name="cell-switch"]').prop("checked", trackState === "track-on" ? true : false);

        //update localstore for row
        panel.updateTrackStore(panel.localStoreObj[panel.dxStateKey][panel.yName], panel.yName, trackState, currentState);

      } else { //cell-switch
        panel.boxObj.removeClass(currentState).addClass(trackState);//update bg for cells

        //update localstore for cell and equivalent rows/columns
        var trackComb = panel.xName+"_sep_"+panel.yName;
        panel.updateTrackStore(panel.localStoreObj[panel.dxStateKey][trackComb], trackComb, trackState, currentState);
        
        //check if by switching this one cell on, all cells in the row are on, then update row switch accordingly
        if(panel.localStoreObj[panel.dyStateKey][panel.yName].state[trackState.replace("track-","")] === panel.localStoreObj[panel.dyStateKey][panel.yName].total){
          panel.TrackPopupType.find('ul li label.switch input[name="row-switch"]').prop("checked", trackState === "track-on" ? true : false);
        }

        //And if by switching this one cell on, all cells in the column are on, then update column switch accordingly
        if(panel.localStoreObj[panel.dxStateKey][panel.xName].state[trackState.replace("track-","")] === panel.localStoreObj[panel.dxStateKey][panel.xName].total){
          panel.TrackPopupType.find('ul li label.switch input[name="column-switch"]').prop("checked", trackState === "track-on" ? true : false);
        }
      }
      //panel.setLocalStorage();
      e.stopPropagation();
    });

    //choosing radio button - track renderer
    panel.TrackPopupType.find('ul li input[type=radio]').off().on("change", function(e) {
      panel.updateRenderer($(this));
      e.stopPropagation();
    });

  },

  updateRenderer: function(clickedEle) {
    var panel         = this;
    var radioName     = clickedEle.attr("name");
    var renderClass   = clickedEle.attr("class").replace(/^_/,"");
    var currentRender = panel.localStoreObj.matrix[panel.cellKey].renderer;
    var dimension     = radioName === "column-radio" ? panel.xName : panel.yName;
    var storeObjKey   = panel.itemDimension(panel.xName);

    if(radioName === "column-radio" || radioName === "row-radio") {
      //update the radio button for cell as well
      panel.TrackPopupType.find('ul li input[name=cell-radio]._'+renderClass).prop("checked", true);

      //update the render class for all cells in the columns, for rows only update cell belonging to matrix
      var matrixClass = radioName === "row-radio" ? ".matrix" : "";
      panel.elLk.rowContainer.find('div.xBoxes._hasData.'+ dimension+matrixClass).removeClass(function(index, className){ return (className.match (/(^|\s)render-\S+/g) || []).join(' ');}).addClass("render-"+renderClass);

      panel.updateTrackStore(panel.localStoreObj[storeObjKey][dimension], dimension, "", "", renderClass, currentRender);
    } else { //cell-radio   
      //updating the render class for the cell
      panel.boxObj.removeClass("render-"+currentRender).addClass("render-"+renderClass);

      //update localstore
      panel.updateTrackStore(panel.localStoreObj[storeObjKey][panel.cellKey], panel.cellKey, "", "", renderClass, currentRender);
    }

    //and if by changing this one cell, all cells in the column are same, then update column renderer accordingly
    if(panel.localStoreObj[panel.dxStateKey][panel.xName].renderer[renderClass] === panel.localStoreObj[panel.dxStateKey][panel.xName].total){
      panel.TrackPopupType.find('ul li input[name=column-radio]._'+renderClass).prop("checked", true);
    } else {
      panel.TrackPopupType.find('ul li input[name=column-radio]').prop("checked", false);
    }

    //check if by changing this one cell, all cells in the row are same, then update row renderer accordingly
    if(panel.localStoreObj[panel.dyStateKey][panel.yName].renderer[renderClass] === panel.localStoreObj[panel.dyStateKey][panel.yName].total){
      panel.TrackPopupType.find('ul li input[name=row-radio]._'+renderClass).prop("checked", true);
    } else {
      panel.TrackPopupType.find('ul li input[name=row-radio]').prop("checked", false);
    }
  }

});
