import Capacitor
import UIKit
import WebKit

/// The web view that runs cobalt. It registers cobalt's plugin, opens on the launch screen's color
/// (light or dark) so there is no white flash, and during a session keeps the bottom edge for the
/// feed: a swipe up there turns the page, and a second one goes home. Capacitor's SystemBars hides
/// the status bar and the home indicator (capacitor.config.ts).
class CobaltViewController: CAPBridgeViewController {
    /// True while a session's pages are showing; set by CobaltPlugin.feed.
    var feedActive = false {
        didSet {
            if feedActive != oldValue { setNeedsUpdateOfScreenEdgesDeferringSystemGestures() }
        }
    }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CobaltPlugin())
        let background = UIColor(named: "LaunchBackground")
        webView?.backgroundColor = background
        webView?.scrollView.backgroundColor = background
    }

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        feedActive ? .bottom : []
    }
}

/// What the web app asks of the phone itself (apps/web/src/platform/native.ts): the screen kept on
/// during a session, a light tap, and the share sheet for the memory export. An app's web view does
/// not honor the web's wake lock or vibration, and cannot download files.
@objc(CobaltPlugin)
public class CobaltPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CobaltPlugin"
    public let jsName = "Cobalt"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "feed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tap", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise)
    ]

    /// While pages show, the screen stays on and the bottom edge belongs to the feed.
    @objc func feed(_ call: CAPPluginCall) {
        let active = call.getBool("active", false)
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = active
            (self.bridge?.viewController as? CobaltViewController)?.feedActive = active
            call.resolve()
        }
    }

    /// A light tap from the Taptic Engine, as a setting changes.
    @objc func tap(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            call.resolve()
        }
    }

    /// Offers a text file through the share sheet (Save to Files, AirDrop, Mail). Resolves with
    /// completed: true once the person saved or sent it, false if they closed the sheet.
    @objc func share(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let text = call.getString("text") else {
            call.reject("A file name and its text are needed.")
            return
        }
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do {
            try text.write(to: file, atomically: true, encoding: .utf8)
        } catch {
            call.reject("The file could not be written.")
            return
        }
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("There is no screen to show the share sheet on.")
                return
            }
            let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            sheet.completionWithItemsHandler = { _, completed, _, _ in
                try? FileManager.default.removeItem(at: file)
                call.resolve(["completed": completed])
            }
            presenter.present(sheet, animated: true)
        }
    }
}
