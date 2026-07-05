(function(){try{if(typeof document<`u`){var e=document.createElement(`style`);e.appendChild(document.createTextNode(`.folderPaneInstancePane{box-sizing:border-box;text-align:left;width:100%;max-width:none;margin-left:0;margin-right:0;margin-top:var(--spacing-xs,.5em);margin-bottom:var(--spacing-xs,.5em);-webkit-overflow-scrolling:touch;border-top:1px solid #777;border-bottom:1px solid #777;align-self:stretch;padding-top:1rem;padding-bottom:1rem;overflow-x:auto}.folderPanePackageDiv{text-align:left;border-top:.2em solid #ccc;width:100%;max-width:none;margin-left:0;margin-right:0;display:block;overflow-x:auto}.folderPaneMainTable{table-layout:auto;text-align:left;width:100%;max-width:none;margin-left:0;margin-right:auto;margin-bottom:var(--spacing-lg,1.5625rem);display:table}.folderPaneMainTable td,.folderPaneMainTable th{text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}.folderPaneMainTable>tr>td.obj,.folderPaneMainTable>tbody>tr>td.obj{padding-left:var(--spacing-lg,1.5625rem)!important}.folderPanePredicateCell{width:0;min-width:0;max-width:0;overflow:hidden;border:0!important;margin:0!important;padding:0!important}.folderPaneCreationDiv{text-align:left;justify-content:flex-start;align-items:flex-start;width:100%;max-width:none;margin-left:0;margin-right:0;display:flex}.folderPaneDropTarget{width:var(--icon-base,2em);min-width:var(--icon-base,2em);max-width:var(--icon-base,2em);height:var(--icon-base,2em);min-height:var(--icon-base,2em);max-height:var(--icon-base,2em);box-sizing:content-box;flex:0 0 var(--icon-base,2em);display:inline-block;margin:0!important;padding:0!important}.folderPaneExplicitDropIcon{width:var(--icon-base,2em);height:var(--icon-base,2em)}@media (width<=700px){.folderPaneInstancePane{margin-top:var(--spacing-2xs,.25em);margin-bottom:var(--spacing-2xs,.25em);border-top:1px solid #777;border-bottom:1px solid #777}.folderPaneExplicitDropIcon{width:var(--icon-sm,1.5em);height:var(--icon-sm,1.5em)}}
:root{--icon-base:2em}`)),document.head.appendChild(e)}}catch(e){console.error(`vite-plugin-css-injected-by-js`,e)}})();

import { authn as e } from "solid-logic";
import * as t from "solid-ui";
//#region src/folderPane.ts
var n = {
	icon: t.icons.iconBase + "noun_973694_expanded.svg",
	name: "folder",
	mintNew: function(e, t) {
		let n = e.session.store, r = t.newInstance || n.sym(t.newBase), i = r.uri;
		return i.endsWith("/") && (i = i.slice(0, -1)), t.newInstance = n.sym(i + "/"), n.fetcher.webOperation("PUT", r.uri).then(function() {
			return console.log("New container created: " + r.uri), t;
		});
	},
	label: function(e, n) {
		let r = n.session.store, i = r.each(e, t.ns.ldp("contains")).length;
		return i > 0 ? "Contents (" + i + ")" : r.holds(e, t.ns.rdf("type"), t.ns.ldp("Container")) ? "Container (0)" : null;
	},
	render: function(n, r) {
		function i(e) {
			let t = e.uri.slice(e.dir().uri.length);
			return !(t.startsWith(".") || t.endsWith(".acl") || t.endsWith("~"));
		}
		function a() {
			let e = c.each(n, t.ns.ldp("contains")).filter(i);
			e = e.map((e) => [t.utils.label(e).toLowerCase(), e]), e.sort(), e = e.map((e) => e[1]), t.utils.syncTableToArray(l, e, function(e) {
				let r = c.statementsMatching(n, t.ns.ldp("contains"), e)[0], i = s.VIEWAS_boring_default, a = s.propertyTR(o, r, !1), l = a.firstChild;
				return l.textContent = "", l.classList.add("folderPanePredicateCell"), a.appendChild(s.outlineObjectTD(e, i, void 0, r)), a;
			});
		}
		let o = r.dom, s = r.getOutliner(o), c = r.session.store, l, u = o.createElement("div");
		u.classList.add("instancePane", "folderPaneInstancePane");
		let d = n.uri.endsWith("/") ? n.uri : n.uri + "/", f = c.sym(d + "index.ttl#this");
		if (c.holds(n, t.ns.ldp("contains"), f.doc())) {
			console.log("View of folder will be view of indexThing. Loading " + f);
			let e = u.appendChild(o.createElement("div"));
			return e.classList.add("folderPanePackageDiv"), c.fetcher.load(f.doc()).then(function() {
				l = e.appendChild(o.createElement("table")), l.classList.add("folderPaneMainTable"), r.getOutliner(o).GotoSubject(f, !0, void 0, !1, void 0, l);
			}), u;
		} else l = u.appendChild(o.createElement("table")), l.classList.add("folderPaneMainTable"), l.refresh = a, a(), c.updater.addDownstreamChangeListener(n, a);
		let p = u.appendChild(o.createElement("div"));
		p.classList.add("folderPaneCreationDiv");
		let m = e.currentUser();
		if (!m) return u;
		let h = {
			folder: n,
			div: p,
			dom: o,
			statusArea: p,
			me: m
		};
		return h.refreshTarget = l, t.login.filterAvailablePanes(r.session.paneRegistry.list).then(function(e) {
			t.create.newThingUI(h, r, e), t.aclControl.preventBrowserDropEvents(o);
			let n;
			n = p.firstChild, n instanceof HTMLElement && n.classList.add("folderPaneDropTarget"), t.widgets.makeDropTarget(n, null, g);
		}), u;
		function g(e) {
			t.widgets.uploadFiles(c.fetcher, e, n.uri, n.uri, function(e, r) {
				let i = c.sym(r);
				console.log(" Upload: put OK: " + i), c.add(n, t.ns.ldp("contains"), i, n.doc()), l.refresh();
			});
		}
	}
};
//#endregion
export { n as default };

//# sourceMappingURL=folderPane.esm.js.map