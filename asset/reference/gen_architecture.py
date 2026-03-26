"""Generate Goodman architecture diagram using diagrams-as-code."""

from diagrams import Diagram, Cluster, Edge
from diagrams.custom import Custom
from diagrams.onprem.client import User
from diagrams.programming.language import TypeScript
from diagrams.generic.storage import Storage
from diagrams.generic.compute import Rack
from diagrams.generic.network import Firewall
from diagrams.generic.blank import Blank
from diagrams.saas.chat import Slack

graph_attr = {
    "bgcolor": "white",
    "pad": "0.8",
    "fontsize": "14",
    "fontname": "Helvetica",
    "rankdir": "TB",
    "nodesep": "0.8",
    "ranksep": "1.0",
    "dpi": "200",
}

node_attr = {
    "fontsize": "11",
    "fontname": "Helvetica",
}

edge_attr = {
    "fontsize": "9",
    "fontname": "Helvetica",
    "color": "#555555",
}

with Diagram(
    "Goodman — Browser Extension Architecture",
    filename="/Users/gongahkia/Desktop/coding/projects/goodman/asset/reference/architecture",
    show=False,
    direction="TB",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
    outformat="png",
):

    user = User("User browses\nweb page")

    with Cluster("Content Script (per tab)", graph_attr={"bgcolor": "#f0f4ff", "style": "rounded", "pencolor": "#4f7cff", "fontsize": "13", "fontname": "Helvetica Bold"}):
        detect = Rack("Detectors\ncheckbox · modal\nfullpage · observer")
        score = Firewall("Scoring &\nConfidence")
        extract = TypeScript("Extractors\ninline · linked · PDF")
        normalize = TypeScript("Normalizer\n& Chunker")
        overlay = Rack("Shadow DOM\nOverlay")

    with Cluster("Background Service Worker", graph_attr={"bgcolor": "#fff7ed", "style": "rounded", "pencolor": "#c4662d", "fontsize": "13", "fontname": "Helvetica Bold"}):
        msg_handler = Rack("Message\nRouter")
        cache_check = Storage("Cache\nLookup")
        provider_resolve = TypeScript("Provider\nFactory")
        llm_call = Rack("LLM Request\n& Retry")
        version_track = TypeScript("Version\nTracking & Diff")
        notify = Rack("Notification\nEngine")

    with Cluster("Popup / Side Panel", graph_attr={"bgcolor": "#f0fdf4", "style": "rounded", "pencolor": "#3f8f63", "fontsize": "13", "fontname": "Helvetica Bold"}):
        popup_state = Rack("State\nReader")
        popup_render = TypeScript("Render\nEngine")
        settings_ui = Rack("Settings\n& History")

    with Cluster("Storage (chrome.storage.local)", graph_attr={"bgcolor": "#fafafa", "style": "rounded", "pencolor": "#999999", "fontsize": "12", "fontname": "Helvetica"}):
        page_analysis = Storage("PageAnalysis\nRecords")
        cache_store = Storage("Summary\nCache")
        version_store = Storage("Version\nHistory")
        settings_store = Storage("Settings &\nPreferences")

    with Cluster("LLM Providers", graph_attr={"bgcolor": "#fdf4ff", "style": "rounded", "pencolor": "#9333ea", "fontsize": "13", "fontname": "Helvetica Bold"}):
        openai = Rack("OpenAI")
        claude = Rack("Claude")
        gemini = Rack("Gemini")
        ollama = Rack("Ollama\n(local)")
        custom = Rack("Custom\nEndpoint")
        hosted = Rack("Goodman\nCloud")

    # user flow
    user >> Edge(label="page load", color="#4f7cff") >> detect
    detect >> Edge(label="candidates", color="#4f7cff") >> score
    score >> Edge(label="best match", color="#4f7cff") >> extract
    extract >> Edge(label="raw text", color="#4f7cff") >> normalize

    # content -> background
    normalize >> Edge(label="PROCESS_PAGE_ANALYSIS", color="#c4662d", style="bold") >> msg_handler

    # background pipeline
    msg_handler >> Edge(label="hash text", color="#c4662d") >> cache_check
    cache_check >> Edge(label="miss", color="#c4662d") >> provider_resolve
    provider_resolve >> Edge(label="provider", color="#c4662d") >> llm_call
    llm_call >> Edge(label="summary", color="#c4662d") >> version_track
    version_track >> Edge(label="changes?", color="#c4662d") >> notify

    # LLM calls
    llm_call >> Edge(color="#9333ea", style="dashed") >> openai
    llm_call >> Edge(color="#9333ea", style="dashed") >> claude
    llm_call >> Edge(color="#9333ea", style="dashed") >> gemini
    llm_call >> Edge(color="#9333ea", style="dashed") >> ollama
    llm_call >> Edge(color="#9333ea", style="dashed") >> custom
    llm_call >> Edge(color="#9333ea", style="dashed") >> hosted

    # storage reads/writes
    cache_check >> Edge(color="#999999", style="dotted") >> cache_store
    version_track >> Edge(color="#999999", style="dotted") >> version_store
    msg_handler >> Edge(color="#999999", style="dotted") >> page_analysis
    settings_ui >> Edge(color="#999999", style="dotted") >> settings_store

    # overlay
    normalize >> Edge(label="overlay", color="#4f7cff", style="dashed") >> overlay

    # popup reads state
    page_analysis >> Edge(label="read", color="#3f8f63", style="dotted") >> popup_state
    popup_state >> Edge(color="#3f8f63") >> popup_render
    popup_render >> Edge(color="#3f8f63") >> settings_ui

    # background -> overlay (via content script message)
    msg_handler >> Edge(label="result", color="#4f7cff", style="dashed") >> overlay
