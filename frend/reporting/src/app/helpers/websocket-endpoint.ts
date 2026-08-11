import { Observable, Subscriber } from 'rxjs';
import Stomp from 'stompjs';
import SockJS from 'sockjs-client';

export class WebSocketEndpoint {
  BACKEND_URL = '/api';

  wsSubscriptions = [];

  _topicsOptions: TopicOptions[];

  socketUrl: string;
  accessToken?: string;
  reconnectionTimeout: number = 30000;

  _socket: SocketEndpoint = new SocketEndpoint();

  observableStompConnection!: Observable<any>;
  subscribers: Array<any> = [];
  subscriberIndex: number = 0;

  _messageIds: Array<any> = [];

  reconnectionPromise: any;

  constructor() {}

  async makeWSConnection(topicsOptions: TopicOptions[]) {
    this._topicsOptions = topicsOptions;
    this.createObservableSocket();
    return this.connect();
  }

  //TO BE OVERIDDEN
  getOptions = () => {
    return {};
  };

  private createObservableSocket = () => {
    this.observableStompConnection = new Observable((observer) => {
      const subscriberIndex = this.subscriberIndex++;
      this.addToSubscribers({ index: subscriberIndex, observer });
      return () => this.removeFromSubscribers(subscriberIndex);
    });
  };

  addToSubscribers = (subscriber: {
    index: number;
    observer: Subscriber<any>;
  }) => {
    this.subscribers.push(subscriber);
  };

  removeFromSubscribers = (index: number) => {
    if (index > this.subscribers.length)
      throw new Error(
        `Unexpected error removing subscriber from websocket, because index ${index} is greater than subscriber length ${this.subscribers.length}`,
      );
    this.subscribers.splice(index, 1);
  };

  getObservable = () => {
    return this.observableStompConnection;
  };

  getMessage = (data: { body: string; headers: { [x: string]: any } }) => {
    let out: any = {};
    out.type = 'SUCCESS';
    out.message = JSON.parse(data.body);
    out.headers = {};
    out.headers.messageId = data.headers['message-id'];

    let messageIdIndex = this._messageIds.indexOf(out.headers.messageId);
    if (messageIdIndex > -1) {
      out.self = true;
      this._messageIds = this._messageIds.splice(messageIdIndex, 1);
    }
    return out;
  };

  _socketListener = () => {
    if (!this._socket.stomp.connected) {
      //console.log('Connection not ready, retrying...');
      setTimeout(this._socketListener, 1000); // retry after 1 second
      return;
    }

    this._topicsOptions.forEach((topicOptions) => {
      const wsSubscription = this._socket.stomp.subscribe(
        topicOptions.topicName,
        (data: any) => {
          //console.log(`Received data: ${JSON.stringify(data)}`);
          const result = topicOptions.processDataCallback(data.body);
          //console.log(`Processed data: ${JSON.stringify(result)}`);
          this.subscribers.forEach((subscriber) =>
            subscriber.observer.next(result),
          );
        },
      );

      this.wsSubscriptions.push(wsSubscription);
    });
  };

  _onSocketError = (errorMsg: any) => {
    //console.log(`WebSocket _onSocketError ${errorMsg}`);

    let out: any = {};
    out.type = 'ERROR';
    out.message = errorMsg;
    this.subscribers.forEach((subscriber) => subscriber.observer.error(out));
    this.scheduleReconnection();
  };

  scheduleReconnection = () => {
    if (this.reconnectionPromise) {
      clearTimeout(this.reconnectionPromise);
    }
    this.reconnectionPromise = setTimeout(() => {
      //console.log(
      //  'Socket reconnecting... (if it fails, next attempt in ' +
      //    this.reconnectionTimeout +
      //    ' msec)',
      //);
      this.connect();
    }, this.reconnectionTimeout);
  };

  reconnectNow = function (this: WebSocketEndpoint) {
    this._socket.stomp.disconnect();
    if (this.reconnectionPromise && this.reconnectionPromise.cancel)
      this.reconnectionPromise.cancel();
    this.connect();
  };

  connect = async () => {
    // Build connection headers for STOMP
    // For Electron: include API key in headers
    // For Web: session cookie is sent automatically by SockJS
    const headers: { [key: string]: string } = {};

    const socketUrl = this.BACKEND_URL + this.socketUrl;

    // The handshake needs no credential of its own:
    //  - standalone (Electron, dev, single-operator server) authenticates the loopback caller in the
    //    backend, before any filter that would ask for one;
    //  - web mode is same-origin, so SockJS sends the JSESSIONID cookie automatically.
    //
    // The token goes on the STOMP CONNECT frame only. It must NOT be appended to socketUrl as a
    // query string: SockJS treats this value as a base and appends `/{server}/{session}/{transport}`
    // to it, so `?access_token=X` would end up in the middle of the transport URL and every
    // connection would fail. ApiKeyAuthenticationFilter does read an `access_token` parameter for
    // /ws paths, but that is for callers that build the URL themselves — not for SockJS.
    if (this.accessToken) {
      headers['X-API-Key'] = this.accessToken;
    }

    this._socket.client = new SockJS(socketUrl);

    this._socket.client.discardWebsocketOnCommFailure = true;
    this._socket.client.connectionTimeout = 500;

    this._socket.stomp = Stomp.over(this._socket.client);
    //this._socket.stomp = Stomp.over(
    //  () => new WebSocket(this._socket.client.url.replace('http', 'ws')),
    //);

    //disable logging
    this._socket.stomp.debug = () => {};
    this._socket.stomp.onclose = this.scheduleReconnection;

    return this._socket.stomp.connect(
      headers,
      this._socketListener,
      this._onSocketError,
    );
  };
}

class SocketEndpoint {
  client: any;
  stomp: any;
}
``;

export class TopicOptions {
  topicName: string;
  processDataCallback: Function;
  brokerName?: string;

  constructor(
    topicName: string,
    processDataCallback: Function,
    brokerName = '',
    reconnectionTimeout: number = 30000,
  ) {
    this.topicName = topicName;
    this.processDataCallback = processDataCallback;
    this.brokerName = brokerName;
  }
}
