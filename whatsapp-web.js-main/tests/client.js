const {expect} = require('chai');
const sinon = require('sinon');

const helper = require('./helper');
const Chat = require('../src/structures/Chat');
const Contact = require('../src/structures/Contact');
const Message = require('../src/structures/Message');
const MessageMedia = require('../src/structures/MessageMedia');
const Location = require('../src/structures/Location');
const { MessageTypes } = require('../src/util/Constants');

const remoteId = helper.remoteId;

describe('Client', function() {
    describe('Authentication', function() {
        it('should emit QR code if not authenticated', async function() {
            this.timeout(25000);
            const callback = sinon.spy();

            const client = helper.createClient();
            client.on('qr', callback);
            client.initialize();

            await helper.sleep(20000);

            expect(callback.called).to.equal(true);
            expect(callback.args[0][0]).to.have.lengthOf(152);

            await client.destroy();
        });

        it('should disconnect after reaching max qr retries', async function () {
            this.timeout(50000);
            
            const qrCallback = sinon.spy();
            const disconnectedCallback = sinon.spy();
            
            const client = helper.createClient({options: {qrMaxRetries: 2}});
            client.on('qr', qrCallback);
            client.on('disconnected', disconnectedCallback);

            client.initialize();

            await helper.sleep(45000);
            
            expect(qrCallback.calledThrice).to.eql(true);
            expect(disconnectedCallback.calledOnceWith('Max qrcode retries reached')).to.eql(true);
        });

        it('should fail auth if session is invalid', async function() {
            this.timeout(40000);

            const authFailCallback = sinon.spy();
            const qrCallback = sinon.spy();
            const readyCallback = sinon.spy();

            const client = helper.createClient({
                options: {
                    session: {
                        WABrowserId: 'invalid', 
                        WASecretBundle: 'invalid', 
                        WAToken1: 'invalid', 
                        WAToken2: 'invalid'
                    },
                    authTimeoutMs: 10000,
                    restartOnAuthFail: false
                }
            });

            client.on('qr', qrCallback);
            client.on('auth_failure', authFailCallback);
            client.on('ready', readyCallback);

            client.initialize();

            await helper.sleep(25000);

            expect(authFailCallback.called).to.equal(true);
            expect(authFailCallback.args[0][0]).to.equal('Unable to log in. Are the session details valid?');

            expect(readyCallback.called).to.equal(false);
            expect(qrCallback.called).to.equal(false);

            await client.destroy();
        });

        it('can restart without a session if session was invalid and restartOnAuthFail=true', async function() {
            this.timeout(40000);

            const authFailCallback = sinon.spy();
            const qrCallback = sinon.spy();

            const client = helper.createClient({
                options:{
                    session: {
                        WABrowserId: 'invalid', 
                        WASecretBundle: 'invalid', 
                        WAToken1: 'invalid', 
                        WAToken2: 'invalid'
                    },
                    authTimeoutMs: 10000,
                    restartOnAuthFail: true
                }
            });

            client.on('auth_failure', authFailCallback);
            client.on('qr', qrCallback);

            client.initialize();

            await helper.sleep(35000);

            expect(authFailCallback.called).to.equal(true);
            expect(qrCallback.called).to.equal(true);
            expect(qrCallback.args[0][0]).to.have.lengthOf(152);

            await client.destroy();
        });
        
        it('should authenticate with existing session', async function() {
            this.timeout(40000);

            const authenticatedCallback = sinon.spy();
            const qrCallback = sinon.spy();
            const readyCallback = sinon.spy();

            const client = helper.createClient({withSession: true});
            client.on('qr', qrCallback);
            client.on('authenticated', authenticatedCallback);
            client.on('ready', readyCallback);

            await client.initialize();

            expect(authenticatedCallback.called).to.equal(true);
            const newSession = authenticatedCallback.args[0][0];
            expect(newSession).to.have.key([
                'WABrowserId', 
                'WASecretBundle', 
                'WAToken1', 
                'WAToken2'
            ]);
            expect(authenticatedCallback.called).to.equal(true);
            expect(readyCallback.called).to.equal(true);
            expect(qrCallback.called).to.equal(false);

            await client.destroy();
        });   
    });

    describe('Authenticated', function() {
        let client;

        before(async function() {
            this.timeout(35000);
            client = helper.createClient({withSession: true});
            await client.initialize();
        });

        after(async function () {
            await client.destroy();
        });

        describe('Expose Store', function() {
            it('exposes the store', async function() {
                const exposed = await client.pupPage.evaluate(() => {
                    return Boolean(window.Store);
                });
    
                expect(exposed).to.equal(true);
            });
    
            it('exposes all required WhatsApp Web internal models', async function() {
                const expectedModules = [
                    'Chat',
                    'Msg',
                    'Contact',
                    'Conn', 
                    'AppState',
                    'CryptoLib', 
                    'Wap', 
                    'SendSeen', 
                    'SendClear', 
                    'SendDelete', 
                    'genId', 
                    'SendMessage', 
                    'MsgKey', 
                    'Invite', 
                    'OpaqueData', 
                    'MediaPrep', 
                    'MediaObject', 
                    'MediaUpload',
                    'Cmd',
                    'MediaTypes',
                    'VCard',
                    'UserConstructor',
                    'Validators',
                    'WidFactory',
                    'BlockContact',
                    'GroupMetadata',
                    'Sticker',
                    'UploadUtils',
                    'Label',
                    'Features',
                    'QueryOrder',
                    'QueryProduct',
                    'DownloadManager'
                ];  
              
                const loadedModules = await client.pupPage.evaluate(() => {
                    return Object.keys(window.Store);
                });
    
                expect(loadedModules).to.include.members(expectedModules);
            });
        });
    
        describe('Send Messages', function () {            
            it('can send a message', async function() {
                const msg = await client.sendMessage(remoteId, 'hello world');
                expect(msg).to.be.instanceOf(Message);
                expect(msg.type).to.equal(MessageTypes.TEXT);
                expect(msg.fromMe).to.equal(true);
                expect(msg.body).to.equal('hello world');
                expect(msg.to).to.equal(remoteId);
            });
    
            it('can send a media message', async function() {
                const media = new MessageMedia(
                    'image/png', 
                    'iVBORw0KGgoAAAANSUhEUgAAAV4AAACWBAMAAABkyf1EAAAAG1BMVEXMzMyWlpacnJyqqqrFxcWxsbGjo6O3t7e+vr6He3KoAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAEcElEQVR4nO2aTW/bRhCGh18ij1zKknMkbbf2UXITIEeyMhIfRaF1exQLA/JRclslRykO+rs7s7s0VwytNmhJtsA8gHZEcox9PTs7uysQgGEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmGYr2OWRK/ReIKI8Zt7Hb19wTcQ0uTkGh13bQupcw7gPOvdo12/5CzNtNR7xLUtNtT3CGBQ6g3InjY720pvofUec22LJPr8PhEp2OMPyI40PdwWUdronCu9yQpdPx53bQlfLKnfOVhlnDYRBXve4Ov+IZTeMgdedm0NR+xoXJeQvdJ3CvziykSukwil16W/Oe7aGjIjqc/9ib4jQlJy0uArtN4A0+cvXFvDkmUJ47sJ1Y1ATLDNVXZkNPIepQzxy1ki9fqiwbUj/I+64zxWNzyZnPuhvohJ9K70VvXBixpcu2SAHU+Xd9EKdEJDNpYP3AQr3bQSpPQ6Y6/4dl1z7ZDbArsszjA7L0g7ibB0CDcidUWVoErvIMKZh2Xs0LUzcLW6V5NfiUgNEbaYmAVL6bXl0nJRc+1S72ua/D/cTjGPlQj7eUqd7A096rYlRjdPYlhz7VIvxpVG3cemDKF+WAwLY/6XelOZKTXXzsC4xvDjjtSN6kHLhLke6PrwM8h1raf40qjrGO7H9aTEbduucjS04ZrYU/4iuS5Z2Hdt0rvCLFdmLEXcU30AGddST62o+sLcf5l6k7CP+ru4pLYqX/VFyxbm/utQbx/r22ZEbTb2f5I2kns1Y1OQR8ZyofX+TjJxj1Rz7QQVnf1QzR26Oth0ueJVYcRP6ZUPac/Rx/5M6ixO1dhSrT3Y1DpiYmx3tF4ZUdpz9LD/dSg9PXES0LB71BwcGjKROuV28lnvnv7HHJsezheBGH5+X2CfSfRbMKW+5aGs3JFjMrjGibJc0S7TJzqjHrh2hDybj9XRXNZa89Aro55XBdbW5wti2c/5WJ7jJ1RolVUn/HWpb0I58Tziup6Rx7Dm2hnbRP1GM9PW/NFmQ4PtVRVN63Wvxfmu5sowDMMwDMMwDMMwDMMwDMMwDMMwzL+CpT//F/6beoV8zb2Jmt4Qryx6lTUCsENQ75HOkhXAO3EPVgyQtKtUy3C/e+FJg17Zjnew1Xrdb9InbG4WqfUAftG+WhLwPVyfg536+MU7m4C1CMk4ZznpXZzDYI1PDL2nS1hpvc5cNd7E2sJg05Fe7/7d3Fln8Cvc3bwB616auxsKl4WPghjemHrDqyDWeu1UNW5s2btPnSQ75oOdunEwWazfwgVG0kqluYCM9OIjWOGnfA2b9G4Ha63XKpvQ8perTvTifJNhi6+WMWmi7smEZf6G8MmhlyGq+NqP8GV84TLuJr7UIQVx+bDEoEpRZIz42gs40OuN4Mv8hXzelV7KX1isH+ewTWckikyVv+CfHuqVF7I16gN0VKypX6wPsE+zFPzkinolU9UH8OMGvSpnZqKsv13p/RsMun6X5x/y2LeAr8O66lsBwzBMP/wJfyGq8pgBk6IAAAAASUVORK5CYII='
                );
    
                const msg = await client.sendMessage(remoteId, media, {caption: 'here\'s my media'});
                expect(msg).to.be.instanceOf(Message);
                expect(msg.type).to.equal(MessageTypes.IMAGE);
                expect(msg.fromMe).to.equal(true);
                expect(msg.hasMedia).to.equal(true);
                expect(msg.body).to.equal('here\'s my media');
                expect(msg.to).to.equal(remoteId);
            });
    
            it('can send a media message as a document', async function() {
                const media = new MessageMedia(
                    'image/png', 
                    'iVBORw0KGgoAAAANSUhEUgAAAV4AAACWBAMAAABkyf1EAAAAG1BMVEXMzMyWlpacnJyqqqrFxcWxsbGjo6O3t7e+vr6He3KoAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAEcElEQVR4nO2aTW/bRhCGh18ij1zKknMkbbf2UXITIEeyMhIfRaF1exQLA/JRclslRykO+rs7s7s0VwytNmhJtsA8gHZEcox9PTs7uysQgGEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmGYr2OWRK/ReIKI8Zt7Hb19wTcQ0uTkGh13bQupcw7gPOvdo12/5CzNtNR7xLUtNtT3CGBQ6g3InjY720pvofUec22LJPr8PhEp2OMPyI40PdwWUdronCu9yQpdPx53bQlfLKnfOVhlnDYRBXve4Ov+IZTeMgdedm0NR+xoXJeQvdJ3CvziykSukwil16W/Oe7aGjIjqc/9ib4jQlJy0uArtN4A0+cvXFvDkmUJ47sJ1Y1ATLDNVXZkNPIepQzxy1ki9fqiwbUj/I+64zxWNzyZnPuhvohJ9K70VvXBixpcu2SAHU+Xd9EKdEJDNpYP3AQr3bQSpPQ6Y6/4dl1z7ZDbArsszjA7L0g7ibB0CDcidUWVoErvIMKZh2Xs0LUzcLW6V5NfiUgNEbaYmAVL6bXl0nJRc+1S72ua/D/cTjGPlQj7eUqd7A096rYlRjdPYlhz7VIvxpVG3cemDKF+WAwLY/6XelOZKTXXzsC4xvDjjtSN6kHLhLke6PrwM8h1raf40qjrGO7H9aTEbduucjS04ZrYU/4iuS5Z2Hdt0rvCLFdmLEXcU30AGddST62o+sLcf5l6k7CP+ru4pLYqX/VFyxbm/utQbx/r22ZEbTb2f5I2kns1Y1OQR8ZyofX+TjJxj1Rz7QQVnf1QzR26Oth0ueJVYcRP6ZUPac/Rx/5M6ixO1dhSrT3Y1DpiYmx3tF4ZUdpz9LD/dSg9PXES0LB71BwcGjKROuV28lnvnv7HHJsezheBGH5+X2CfSfRbMKW+5aGs3JFjMrjGibJc0S7TJzqjHrh2hDybj9XRXNZa89Aro55XBdbW5wti2c/5WJ7jJ1RolVUn/HWpb0I58Tziup6Rx7Dm2hnbRP1GM9PW/NFmQ4PtVRVN63Wvxfmu5sowDMMwDMMwDMMwDMMwDMMwDMMwzL+CpT//F/6beoV8zb2Jmt4Qryx6lTUCsENQ75HOkhXAO3EPVgyQtKtUy3C/e+FJg17Zjnew1Xrdb9InbG4WqfUAftG+WhLwPVyfg536+MU7m4C1CMk4ZznpXZzDYI1PDL2nS1hpvc5cNd7E2sJg05Fe7/7d3Fln8Cvc3bwB616auxsKl4WPghjemHrDqyDWeu1UNW5s2btPnSQ75oOdunEwWazfwgVG0kqluYCM9OIjWOGnfA2b9G4Ha63XKpvQ8perTvTifJNhi6+WMWmi7smEZf6G8MmhlyGq+NqP8GV84TLuJr7UIQVx+bDEoEpRZIz42gs40OuN4Mv8hXzelV7KX1isH+ewTWckikyVv+CfHuqVF7I16gN0VKypX6wPsE+zFPzkinolU9UH8OMGvSpnZqKsv13p/RsMun6X5x/y2LeAr8O66lsBwzBMP/wJfyGq8pgBk6IAAAAASUVORK5CYII=',
                    'this is my filename.png'
                );
    
                const msg = await client.sendMessage(remoteId, media, { sendMediaAsDocument: true});
                expect(msg).to.be.instanceOf(Message);
                expect(msg.type).to.equal(MessageTypes.DOCUMENT);
                expect(msg.fromMe).to.equal(true);
                expect(msg.hasMedia).to.equal(true);
                expect(msg.body).to.equal('this is my filename.png');
                expect(msg.to).to.equal(remoteId);
            });
    
            it('can send a sticker message', async function() {
                const media = new MessageMedia(
                    'image/png', 
                    'iVBORw0KGgoAAAANSUhEUgAAAV4AAACWBAMAAABkyf1EAAAAG1BMVEXMzMyWlpacnJyqqqrFxcWxsbGjo6O3t7e+vr6He3KoAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAEcElEQVR4nO2aTW/bRhCGh18ij1zKknMkbbf2UXITIEeyMhIfRaF1exQLA/JRclslRykO+rs7s7s0VwytNmhJtsA8gHZEcox9PTs7uysQgGEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmGYr2OWRK/ReIKI8Zt7Hb19wTcQ0uTkGh13bQupcw7gPOvdo12/5CzNtNR7xLUtNtT3CGBQ6g3InjY720pvofUec22LJPr8PhEp2OMPyI40PdwWUdronCu9yQpdPx53bQlfLKnfOVhlnDYRBXve4Ov+IZTeMgdedm0NR+xoXJeQvdJ3CvziykSukwil16W/Oe7aGjIjqc/9ib4jQlJy0uArtN4A0+cvXFvDkmUJ47sJ1Y1ATLDNVXZkNPIepQzxy1ki9fqiwbUj/I+64zxWNzyZnPuhvohJ9K70VvXBixpcu2SAHU+Xd9EKdEJDNpYP3AQr3bQSpPQ6Y6/4dl1z7ZDbArsszjA7L0g7ibB0CDcidUWVoErvIMKZh2Xs0LUzcLW6V5NfiUgNEbaYmAVL6bXl0nJRc+1S72ua/D/cTjGPlQj7eUqd7A096rYlRjdPYlhz7VIvxpVG3cemDKF+WAwLY/6XelOZKTXXzsC4xvDjjtSN6kHLhLke6PrwM8h1raf40qjrGO7H9aTEbduucjS04ZrYU/4iuS5Z2Hdt0rvCLFdmLEXcU30AGddST62o+sLcf5l6k7CP+ru4pLYqX/VFyxbm/utQbx/r22ZEbTb2f5I2kns1Y1OQR8ZyofX+TjJxj1Rz7QQVnf1QzR26Oth0ueJVYcRP6ZUPac/Rx/5M6ixO1dhSrT3Y1DpiYmx3tF4ZUdpz9LD/dSg9PXES0LB71BwcGjKROuV28lnvnv7HHJsezheBGH5+X2CfSfRbMKW+5aGs3JFjMrjGibJc0S7TJzqjHrh2hDybj9XRXNZa89Aro55XBdbW5wti2c/5WJ7jJ1RolVUn/HWpb0I58Tziup6Rx7Dm2hnbRP1GM9PW/NFmQ4PtVRVN63Wvxfmu5sowDMMwDMMwDMMwDMMwDMMwDMMwzL+CpT//F/6beoV8zb2Jmt4Qryx6lTUCsENQ75HOkhXAO3EPVgyQtKtUy3C/e+FJg17Zjnew1Xrdb9InbG4WqfUAftG+WhLwPVyfg536+MU7m4C1CMk4ZznpXZzDYI1PDL2nS1hpvc5cNd7E2sJg05Fe7/7d3Fln8Cvc3bwB616auxsKl4WPghjemHrDqyDWeu1UNW5s2btPnSQ75oOdunEwWazfwgVG0kqluYCM9OIjWOGnfA2b9G4Ha63XKpvQ8perTvTifJNhi6+WMWmi7smEZf6G8MmhlyGq+NqP8GV84TLuJr7UIQVx+bDEoEpRZIz42gs40OuN4Mv8hXzelV7KX1isH+ewTWckikyVv+CfHuqVF7I16gN0VKypX6wPsE+zFPzkinolU9UH8OMGvSpnZqKsv13p/RsMun6X5x/y2LeAr8O66lsBwzBMP/wJfyGq8pgBk6IAAAAASUVORK5CYII='
                );
    
                const msg = await client.sendMessage(remoteId, media, {sendMediaAsSticker: true});
                expect(msg).to.be.instanceOf(Message);
                expect(msg.type).to.equal(MessageTypes.STICKER);
                expect(msg.fromMe).to.equal(true);
                expect(msg.hasMedia).to.equal(true);
                expect(msg.to).to.equal(remoteId);
            });
    
            it('can send a sticker message with custom author and name', async function() {
                const media = new MessageMedia(
                    'image/png', 
                    'iVBORw0KGgoAAAANSUhEUgAAAV4AAACWBAMAAABkyf1EAAAAG1BMVEXMzMyWlpacnJyqqqrFxcWxsbGjo6O3t7e+vr6He3KoAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAEcElEQVR4nO2aTW/bRhCGh18ij1zKknMkbbf2UXITIEeyMhIfRaF1exQLA/JRclslRykO+rs7s7s0VwytNmhJtsA8gHZEcox9PTs7uysQgGEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmEYhmGYr2OWRK/ReIKI8Zt7Hb19wTcQ0uTkGh13bQupcw7gPOvdo12/5CzNtNR7xLUtNtT3CGBQ6g3InjY720pvofUec22LJPr8PhEp2OMPyI40PdwWUdronCu9yQpdPx53bQlfLKnfOVhlnDYRBXve4Ov+IZTeMgdedm0NR+xoXJeQvdJ3CvziykSukwil16W/Oe7aGjIjqc/9ib4jQlJy0uArtN4A0+cvXFvDkmUJ47sJ1Y1ATLDNVXZkNPIepQzxy1ki9fqiwbUj/I+64zxWNzyZnPuhvohJ9K70VvXBixpcu2SAHU+Xd9EKdEJDNpYP3AQr3bQSpPQ6Y6/4dl1z7ZDbArsszjA7L0g7ibB0CDcidUWVoErvIMKZh2Xs0LUzcLW6V5NfiUgNEbaYmAVL6bXl0nJRc+1S72ua/D/cTjGPlQj7eUqd7A096rYlRjdPYlhz7VIvxpVG3cemDKF+WAwLY/6XelOZKTXXzsC4xvDjjtSN6kHLhLke6PrwM8h1raf40qjrGO7H9aTEbduucjS04ZrYU/4iuS5Z2Hdt0rvCLFdmLEXcU30AGddST62o+sLcf5l6k7CP+ru4pLYqX/VFyxbm/utQbx/r22ZEbTb2f5I2kns1Y1OQR8ZyofX+TjJxj1Rz7QQVnf1QzR26Oth0ueJVYcRP6ZUPac/Rx/5M6ixO1dhSrT3Y1DpiYmx3tF4ZUdpz9LD/dSg9PXES0LB71BwcGjKROuV28lnvnv7HHJsezheBGH5+X2CfSfRbMKW+5aGs3JFjMrjGibJc0S7TJzqjHrh2hDybj9XRXNZa89Aro55XBdbW5wti2c/5WJ7jJ1RolVUn/HWpb0I58Tziup6Rx7Dm2hnbRP1GM9PW/NFmQ4PtVRVN63Wvxfmu5sowDMMwDMMwDMMwDMMwDMMwDMMwzL+CpT//F/6beoV8zb2Jmt4Qryx6lTUCsENQ75HOkhXAO3EPVgyQtKtUy3C/e+FJg17Zjnew1Xrdb9InbG4WqfUAftG+WhLwPVyfg536+MU7m4C1CMk4ZznpXZzDYI1PDL2nS1hpvc5cNd7E2sJg05Fe7/7d3Fln8Cvc3bwB616auxsKl4WPghjemHrDqyDWeu1UNW5s2btPnSQ75oOdunEwWazfwgVG0kqluYCM9OIjWOGnfA2b9G4Ha63XKpvQ8perTvTifJNhi6+WMWmi7smEZf6G8MmhlyGq+NqP8GV84TLuJr7UIQVx+bDEoEpRZIz42gs40OuN4Mv8hXzelV7KX1isH+ewTWckikyVv+CfHuqVF7I16gN0VKypX6wPsE+zFPzkinolU9UH8OMGvSpnZqKsv13p/RsMun6X5x/y2LeAr8O66lsBwzBMP/wJfyGq8pgBk6IAAAAASUVORK5CYII='
                );
    
                const msg = await client.sendMessage(remoteId, media, {
                    sendMediaAsSticker: true, 
                    stickerAuthor: 'WWEBJS', 
                    stickerName: 'My Sticker'
                });
                expect(msg).to.be.instanceOf(Message);
                expect(msg.type).to.equal(MessageTypes.STICKER);
                expect(msg.fromMe).to.equal(true);
                expect(msg.hasMedia).to.equal(true);
                expect(msg.to).to.equal(remoteId);
            });
    
            it('can send a location message', async function() {
                const location = new Location(37.422, -122.084, 'Googleplex\nGoogle Headquarters');
    
                const msg = await client.sendMessage(remoteId, location);
                expect(msg).to.be.instanceOf(Message);
                expect(msg.type).to.equal(MessageTypes.LOCATION);
                expect(msg.fromMe).to.equal(true);
                expect(msg.to).to.equal(remoteId);
    
                expect(msg.location).to.be.instanceOf(Location);
                expect(msg.location.latitude).to.equal(37.422);
                expect(msg.location.longitude).to.equal(-122.084);
                expect(msg.location.description).to.equal('Googleplex\nGoogle Headquarters');
            });
    
            it('can send a vCard as a contact card message', async function() {
                const vCard = `BEGIN:VCARD
VERSION:3.0
FN;CHARSET=UTF-8:John Doe
N;CHARSET=UTF-8:Doe;John;;;
EMAIL;CHARSET=UTF-8;type=HOME,INTERNET:john@doe.com
TEL;TYPE=HOME,VOICE:1234567890
REV:2021-06-06T02:35:53.559Z
END:VCARD`;
    
                const msg = await client.sendMessage(remoteId, vCard);
                expect(msg).to.be.instanceOf(Message);
                expect(msg.type).to.equal(MessageTypes.CONTACT_CARD);
                expect(msg.fromMe).to.equal(true);
                expect(msg.to).to.equal(remoteId);
                expect(msg.body).to.equal(vCard);
                expect(msg.vCards).to.have.lengthOf(1);
                expect(msg.vCards[0]).to.equal(vCard);
            });
    
            it('can optionally turn off vCard parsing', async function() {
                const vCard = `BEGIN:VCARD
VERSION:3.0
FN;CHARSET=UTF-8:John Doe
N;CHARSET=UTF-8:Doe;John;;;
EMAIL;CHARSET=UTF-8;type=HOME,INTERNET:john@doe.com
TEL;TYPE=HOME,VOICE:1234567890
REV:2021-06-06T02:35:53.559Z
END:VCARD`;
    
                const msg = await client.sendMessage(remoteId, vCard, {parseVCards: false});
                expect(msg).to.be.instanceOf(Message);
                expect(msg.type).to.equal(MessageTypes.TEXT); // not a contact card
                expect(msg.fromMe).to.equal(true);
                expect(msg.to).to.equal(remoteId);
                expect(msg.body).to.equal(vCard);
            });
    
            it('can send a Contact as a contact card message', async function() {
                const contact = await client.getContactById(remoteId);
    
                const msg = await client.sendMessage(remoteId, contact);
                expect(msg).to.be.instanceOf(Message);
                expect(msg.type).to.equal(MessageTypes.CONTACT_CARD);
                expect(msg.fromMe).to.equal(true);
                expect(msg.to).to.equal(remoteId);
                expect(msg.body).to.match(/BEGIN:VCARD/);
                expect(msg.vCards).to.have.lengthOf(1);
                expect(msg.vCards[0]).to.match(/BEGIN:VCARD/);
            });
    
            it('can send multiple Contacts as a contact card message', async function () {
                const contact1 = await client.getContactById(remoteId);
                const contact2 = await client.getContactById('5511942167462@c.us'); //iFood
    
                const msg = await client.sendMessage(remoteId, [contact1, contact2]);
                expect(msg).to.be.instanceOf(Message);
                expect(msg.type).to.equal(MessageTypes.CONTACT_CARD_MULTI);
                expect(msg.fromMe).to.equal(true);
                expect(msg.to).to.equal(remoteId);
                expect(msg.vCards).to.have.lengthOf(2);
                expect(msg.vCards[0]).to.match(/BEGIN:VCARD/);
                expect(msg.vCards[1]).to.match(/BEGIN:VCARD/);
            });
        });
    
        describe('Get Chats', function () {    
            it('can get a chat by its ID', async function () {
                const chat = await client.getChatById(remoteId);
                expect(chat).to.be.instanceOf(Chat);
                expect(chat.id._serialized).to.eql(remoteId);
                expect(chat.isGroup).to.eql(false);
            });
    
            it('can get all chats', async function () {
                const chats = await client.getChats();
                expect(chats.length).to.be.greaterThanOrEqual(1);
    
                const chat = chats.find(c => c.id._serialized === remoteId);
                expect(chat).to.exist;
                expect(chat).to.be.instanceOf(Chat);
            });
        });

        describe('Get Contacts', function () {    
            it('can get a contact by its ID', async function () {
                const contact = await client.getContactById(remoteId);
                expect(contact).to.be.instanceOf(Contact);
                expect(contact.id._serialized).to.eql(remoteId);
                expect(contact.number).to.eql(remoteId.split('@')[0]);
            });
    
            it('can get all contacts', async function () {
                const contacts = await client.getContacts();
                expect(contacts.length).to.be.greaterThanOrEqual(1);
    
                const contact = contacts.find(c => c.id._serialized === remoteId);
                expect(contact).to.exist;
                expect(contact).to.be.instanceOf(Contact);
            });

            it('can block a contact', async function () {
                const contact = await client.getContactById(remoteId);
                await contact.block();

                const refreshedContact = await client.getContactById(remoteId);
                expect(refreshedContact.isBlocked).to.eql(true);
            });

            it('can get a list of blocked contacts', async function () {
                const blockedContacts = await client.getBlockedContacts();
                expect(blockedContacts.length).to.be.greaterThanOrEqual(1);

                const contact = blockedContacts.find(c => c.id._serialized === remoteId);
                expect(contact).to.exist;
                expect(contact).to.be.instanceOf(Contact);

            });

            it('can unblock a contact', async function () {
                const contact = await client.getContactById(remoteId);
                await contact.unblock();

                const refreshedContact = await client.getContactById(remoteId);
                expect(refreshedContact.isBlocked).to.eql(false);
            });
        });

        describe('Numbers and Users', function () {
            it('can verify that a user is registered', async function () {
                const isRegistered = await client.isRegisteredUser(remoteId);
                expect(isRegistered).to.be.true;
            });

            it('can verify that a user is not registered', async function () {
                const isRegistered = await client.isRegisteredUser('9999999999@c.us');
                expect(isRegistered).to.be.false;
            });

            it('can get a number\'s whatsapp id', async function () {
                const number = remoteId.split('@')[0];
                const numberId = await client.getNumberId(number);
                expect(numberId).to.eql({
                    server: 'c.us',
                    user: number,
                    _serialized: `${number}@c.us`
                });
            });

            it('returns null when getting an unregistered number\'s whatsapp id', async function () {
                const number = '9999999999';
                const numberId = await client.getNumberId(number);
                expect(numberId).to.eql(null);
            });

            it('can get a number\'s country code', async function () {
                const number = '18092201111';
                const countryCode = await client.getCountryCode(number);
                expect(countryCode).to.eql('1');
            });

            it('can get a formatted number', async function () {
                const number = '18092201111';
                const formatted = await client.getFormattedNumber(number);
                expect(formatted).to.eql('+1 (809) 220-1111');
            });

            it('can get a formatted number from a serialized ID', async function () {
                const number = '18092201111@c.us';
                const formatted = await client.getFormattedNumber(number);
                expect(formatted).to.eql('+1 (809) 220-1111');
            });
        });
    });
});